/**
 * Create a Stripe PaymentIntent for purchasing creds
 * POST /api/purchase/create
 * Body: { pack: 'starter' | 'value', email: string }
 */

import type { RequestHandler } from './$types';
import { jsonResponse } from '../../creds-auth';

const PACKS = {
	starter: { amount: 200, creds: 10, label: '10 creds' },  // $2.00
	value: { amount: 700, creds: 50, label: '50 creds' },    // $7.00
} as const;

type PackId = keyof typeof PACKS;

export const POST: RequestHandler = async ({ request, platform }) => {
	const STRIPE_SECRET_KEY = platform?.env?.STRIPE_SECRET_KEY;
	if (!STRIPE_SECRET_KEY) {
		return jsonResponse({ error: 'Stripe not configured' }, 500);
	}

	const DB = platform?.env?.DB;
	if (!DB) return jsonResponse({ error: 'Database not available' }, 500);

	try {
		const body = await request.json() as { pack: string; email: string };

		if (!body.email || typeof body.email !== 'string') {
			return jsonResponse({ error: 'Email is required' }, 400);
		}

		if (!body.pack || !(body.pack in PACKS)) {
			return jsonResponse({ error: 'Invalid pack' }, 400);
		}

		const pack = PACKS[body.pack as PackId];

		// Get or create Stripe customer
		let stripeCustomerId: string | null = null;
		const account = await DB.prepare(
			'SELECT id, stripe_customer_id FROM accounts WHERE email = ?'
		).bind(body.email).first<{ id: string; stripe_customer_id: string | null }>();

		if (account?.stripe_customer_id) {
			stripeCustomerId = account.stripe_customer_id;
		} else {
			// Search Stripe for existing customer by email
			const searchRes = await fetch(
				`https://api.stripe.com/v1/customers?email=${encodeURIComponent(body.email)}&limit=1`,
				{ headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` } }
			);

			if (searchRes.ok) {
				const { data } = await searchRes.json() as { data: { id: string }[] };
				if (data.length > 0) {
					stripeCustomerId = data[0].id;
				}
			}

			// Create new customer if not found
			if (!stripeCustomerId) {
				const customerRes = await fetch('https://api.stripe.com/v1/customers', {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: new URLSearchParams({ email: body.email }),
				});

				if (customerRes.ok) {
					const customer = await customerRes.json() as { id: string };
					stripeCustomerId = customer.id;
				}
			}

			// Sync customer ID to local account
			if (stripeCustomerId && account) {
				await DB.prepare(
					"UPDATE accounts SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?"
				).bind(stripeCustomerId, account.id).run();
			}
		}

		// Create PaymentIntent
		const params = new URLSearchParams({
			amount: pack.amount.toString(),
			currency: 'usd',
			'automatic_payment_methods[enabled]': 'true',
			'metadata[email]': body.email,
			'metadata[pack]': body.pack,
			'metadata[creds]': pack.creds.toString(),
			receipt_email: body.email,
			description: `difflog ${pack.label}`,
		});

		if (stripeCustomerId) {
			params.set('customer', stripeCustomerId);
		}

		const response = await fetch('https://api.stripe.com/v1/payment_intents', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params,
		});

		if (!response.ok) {
			const error = await response.json() as { error?: { message?: string } };
			console.error('Stripe error:', error);
			return jsonResponse({ error: error.error?.message || 'Payment failed' }, 400);
		}

		const paymentIntent = await response.json() as { client_secret: string; id: string };

		return jsonResponse({ clientSecret: paymentIntent.client_secret });
	} catch (e) {
		console.error('Checkout error:', e);
		return jsonResponse({ error: 'Failed to create payment' }, 500);
	}
};

/**
 * Send email verification code for creds
 * POST /api/creds/request
 */

import type { RequestHandler } from './$types';
import { generateCode, jsonResponse } from '../../creds-auth';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json() as { email: string };

		if (!body.email || typeof body.email !== 'string') {
			return jsonResponse({ error: 'Email is required' }, 400);
		}

		const code = await generateCode(body.email);

		// Log to console for dev testing
		console.log(`\n[Mock Email] Verification code for ${body.email}: ${code}\n`);

		// In production, this would send an actual email via SES/Resend/etc.

		return jsonResponse({ success: true });
	} catch {
		return jsonResponse({ error: 'Failed to send verification code' }, 500);
	}
};

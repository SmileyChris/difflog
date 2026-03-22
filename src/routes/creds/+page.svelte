<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { PageHeader, HeaderNav, SiteFooter } from '$lib/components';
	import { getCredsAuth, getCredBalance, getUserEmail, isLoggedIn, updateCredBalance } from '$lib/stores/account.svelte';

	let historyFilter = $state<'topups' | 'usage'>('topups');
	let transactions = $state<Array<{ id: string; type: string; amount: number; balance_after: number; description: string; created_at: string }>>([]);
	let historyLoading = $state(false);

	let checkoutPack = $state<'starter' | 'value' | null>(null);
	let checkoutError = $state('');
	let checkoutLoading = $state(false);
	let paymentSuccess = $state(false);

	const credBalance = $derived(getCredBalance());
	const email = $derived(getUserEmail());
	const loggedIn = $derived(isLoggedIn());

	async function loadHistory(filter: 'topups' | 'usage') {
		const auth = getCredsAuth();
		if (!auth) return;
		historyLoading = true;
		try {
			const params = new URLSearchParams({
				email: auth.email,
				code: auth.code,
				filter
			});
			const res = await fetch(`/api/creds/history?${params}`);
			if (res.ok) {
				const data = await res.json() as { transactions: typeof transactions; creds: number };
				transactions = data.transactions;
				updateCredBalance(data.creds);
			}
		} catch { /* ignore */ }
		historyLoading = false;
	}

	function switchFilter(filter: 'topups' | 'usage') {
		historyFilter = filter;
		loadHistory(filter);
	}

	async function startPurchase(pack: 'starter' | 'value') {
		const auth = getCredsAuth();
		if (!auth) return;
		checkoutPack = pack;
		checkoutError = '';
		checkoutLoading = true;
		paymentSuccess = false;

		try {
			const res = await fetch('/api/purchase/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pack, email: auth.email })
			});

			if (!res.ok) {
				const data = await res.json() as { error: string };
				checkoutError = data.error || 'Failed to start checkout';
				checkoutLoading = false;
				return;
			}

			const data = await res.json() as { clientSecret: string };
			checkoutLoading = false;

			// Load Stripe.js and mount payment element
			await mountStripePayment(data.clientSecret, pack);
		} catch {
			checkoutError = 'Failed to start checkout';
			checkoutLoading = false;
		}
	}

	let stripeElementContainer: HTMLDivElement;
	let stripe: any = null;
	let elements: any = null;

	async function mountStripePayment(clientSecret: string, pack: string) {
		// Dynamically load Stripe.js
		if (!stripe) {
			const script = document.createElement('script');
			script.src = 'https://js.stripe.com/v3/';
			document.head.appendChild(script);
			await new Promise<void>((resolve) => { script.onload = () => resolve(); });
			stripe = (window as any).Stripe((window as any).__STRIPE_PK || 'pk_test_placeholder');
		}

		elements = stripe.elements({ clientSecret, appearance: { theme: 'night' } });
		const paymentElement = elements.create('payment');
		paymentElement.mount(stripeElementContainer);
	}

	async function handlePayment() {
		if (!stripe || !elements) return;
		checkoutLoading = true;
		checkoutError = '';

		const { error } = await stripe.confirmPayment({
			elements,
			confirmParams: { return_url: window.location.href },
			redirect: 'if_required'
		});

		if (error) {
			checkoutError = error.message || 'Payment failed';
			checkoutLoading = false;
			return;
		}

		// Poll for balance update
		paymentSuccess = true;
		checkoutLoading = false;

		const pollAuth = getCredsAuth();
		for (let i = 0; i < 10; i++) {
			await new Promise(r => setTimeout(r, 2000));
			if (pollAuth) {
				const params = new URLSearchParams({ email: pollAuth.email, code: pollAuth.code, filter: 'topups' });
				const res = await fetch(`/api/creds/history?${params}`);
				if (res.ok) {
					const data = await res.json() as { creds: number };
					if (data.creds > credBalance) {
						updateCredBalance(data.creds);
						break;
					}
				}
			}
		}

		setTimeout(() => {
			checkoutPack = null;
			paymentSuccess = false;
			loadHistory(historyFilter);
		}, 2000);
	}

	onMount(() => {
		if (isLoggedIn()) loadHistory(historyFilter);
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Credits | diff·log</title>
</svelte:head>

<PageHeader>
	<HeaderNav />
</PageHeader>

<main class="page-content">
	{#if !loggedIn}
		<div class="creds-login-prompt">
			<p>Sign in to manage your credits.</p>
			<a href="/setup" class="btn-primary btn-branded">Set up profile</a>
		</div>
	{:else}
		<div class="creds-page-content">
			<div class="creds-current">
				<div class="creds-current-label">Your Balance</div>
				<div class="creds-current-balance" class:creds-empty={credBalance === 0}>
					<span class="creds-coin">&#9673;</span>
					<span class="creds-current-count">{credBalance}</span>
				</div>
				<div class="creds-current-email">{email}</div>
				<div class="creds-byok-link">
					Want unlimited diffs? <a href="/setup">Bring your own API key</a>
				</div>
			</div>

			<div class="creds-packs-page">
				<div class="creds-pack creds-pack-popular">
					<div class="creds-pack-badge">POPULAR</div>
					<div class="creds-pack-name">Starter</div>
					<div class="creds-pack-amount"><span class="creds-coin">&#9673;</span> 10 creds</div>
					<div class="creds-pack-price">$2 <span class="creds-pack-for">USD</span></div>
					<div class="creds-pack-perunit">$0.20/cred</div>
					<button class="btn-primary btn-branded btn-creds-buy" onclick={() => startPurchase('starter')}>Buy</button>
				</div>
				<div class="creds-pack creds-pack-best">
					<div class="creds-pack-badge">BEST VALUE</div>
					<div class="creds-pack-name">Value</div>
					<div class="creds-pack-amount"><span class="creds-coin">&#9673;</span> 50 creds</div>
					<div class="creds-pack-price">$7 <span class="creds-pack-for">USD</span></div>
					<div class="creds-pack-perunit">$0.14/cred</div>
					<button class="btn-primary btn-branded btn-creds-buy" onclick={() => startPurchase('value')}>Buy</button>
				</div>
			</div>

			<!-- Transaction History -->
			<div class="creds-history" style="width: 100%; max-width: 500px;">
				<div class="creds-history-tabs">
					<button class="creds-history-tab" class:active={historyFilter === 'topups'} onclick={() => switchFilter('topups')}>Top-ups</button>
					<button class="creds-history-tab" class:active={historyFilter === 'usage'} onclick={() => switchFilter('usage')}>Usage</button>
				</div>

				{#if historyLoading}
					<p class="creds-history-loading">Loading...</p>
				{:else if transactions.length === 0}
					<p class="creds-history-empty">No {historyFilter === 'usage' ? 'usage' : 'top-up'} history yet</p>
				{:else}
					<div class="creds-history-list">
						{#each transactions as tx}
							<div class="creds-history-item">
								<span class="creds-history-amount" class:creds-usage={tx.amount < 0}>
									{tx.amount > 0 ? '+' : ''}{tx.amount}
								</span>
								<span class="creds-history-desc">{tx.description}</span>
								<span class="creds-history-date">{formatDate(tx.created_at)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</main>

<!-- Checkout Modal -->
{#if checkoutPack}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="creds-modal" onclick={() => { if (!checkoutLoading) checkoutPack = null; }}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="creds-modal-content creds-checkout-modal" onclick={(e) => e.stopPropagation()}>
			<div class="creds-modal-header">
				<h3 class="creds-modal-title">
					{checkoutPack === 'starter' ? 'Starter Pack' : 'Value Pack'}
				</h3>
				<button class="creds-modal-close" onclick={() => checkoutPack = null}>&times;</button>
			</div>

			{#if paymentSuccess}
				<div class="creds-success-inline">
					<span class="creds-success-check">&#10003;</span>
					Payment successful! Credits added.
				</div>
			{:else}
				{#if checkoutError}
					<div class="creds-error">{checkoutError}</div>
				{/if}

				<div class="creds-payment-element" bind:this={stripeElementContainer}></div>

				<button
					class="btn-primary creds-pay-btn"
					disabled={checkoutLoading}
					onclick={handlePayment}
				>
					{checkoutLoading ? 'Processing...' : `Pay ${checkoutPack === 'starter' ? '$2' : '$7'}`}
				</button>
			{/if}
		</div>
	</div>
{/if}

<SiteFooter />

<style>
	.page-content {
		max-width: 650px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
</style>

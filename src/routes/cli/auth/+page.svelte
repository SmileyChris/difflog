<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { profiles } from '$lib/stores/profiles.svelte';
	import { histories } from '$lib/stores/history.svelte';
	import { encryptData } from '$lib/utils/crypto';
	import { fetchJson } from '$lib/utils/api';

	let profileId = $state('');
	let error = $state('');
	let submitting = $state(false);
	let step = $state<'verify' | 'login' | 'expired'>('verify');

	const code = $derived(page.url.searchParams.get('code') || '');
	const expires = $derived(Number(page.url.searchParams.get('expires')) || 0);
	const validCode = $derived(/^[0-9a-f]{12}$/.test(code) && expires > 0);

	let verificationCode = $state('');

	// Generate verification code from hash of code + expires
	async function generateVerificationCode() {
		if (!code || !expires) return;
		const data = new TextEncoder().encode(code + String(expires));
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		verificationCode = hashHex.slice(-4);
	}

	// Countdown timer
	let remaining = $state(0);
	let timerInterval: ReturnType<typeof setInterval> | undefined;

	function formatTime(ms: number): string {
		const s = Math.max(0, Math.ceil(ms / 1000));
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}

	function startTimer() {
		if (!expires) return;
		remaining = expires - Date.now();
		if (remaining <= 0) {
			step = 'expired';
			return;
		}

		timerInterval = setInterval(() => {
			remaining = expires - Date.now();
			if (remaining <= 0) {
				remaining = 0;
				clearInterval(timerInterval);
				step = 'expired';
			}
		}, 1000);
	}

	const profileList = $derived(
		Object.values(profiles.value).filter((p) => p.id && p.name)
	);
	const hasProfiles = $derived(profileList.length > 0);
	const selectedProfile = $derived(profileList.find((p) => p.id === profileId));
	const isShared = $derived(selectedProfile?.passwordSalt ? true : false);

	let qrDataUrl = $state('');

	onMount(() => {
		if (profileList.length === 1) {
			profileId = profileList[0].id;
		}
		generateVerificationCode();
		startTimer();
		return () => { if (timerInterval) clearInterval(timerInterval); };
	});

	function confirmCode() {
		step = 'login';
		if (!hasProfiles) generateQrCode();
	}

	async function generateQrCode() {
		try {
			if (!(window as { qrcode?: unknown }).qrcode) {
				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script');
					script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
					script.onload = () => resolve();
					script.onerror = () => reject();
					document.head.appendChild(script);
				});
			}
			const qrLib = (window as { qrcode: (typeNumber: number, errorCorrectionLevel: string) => { addData: (data: string) => void; make: () => void; createDataURL: (cellSize: number, margin: number) => string } }).qrcode;
			const qr = qrLib(0, 'M');
			qr.addData(`${window.location.origin}/cli/auth?code=${code}&expires=${expires}`);
			qr.make();
			qrDataUrl = qr.createDataURL(5, 4);
		} catch {
			// QR generation failed silently
		}
	}

	async function submit() {
		error = '';
		const profile = selectedProfile;
		if (!profile) {
			error = 'Select a profile.';
			return;
		}

		submitting = true;
		try {
			const diffs = histories.value[profileId] ?? [];
			const payload = {
				profile: {
					id: profile.id,
					name: profile.name,
					languages: profile.languages ?? [],
					frameworks: profile.frameworks ?? [],
					tools: profile.tools ?? [],
					topics: profile.topics ?? [],
					depth: profile.depth || 'standard',
					customFocus: profile.customFocus || ''
				},
				diffs
			};

			// Encode expires as base64 salt (crypto expects base64-encoded salt)
			const expiresBytes = new TextEncoder().encode(String(expires));
			const expiresSalt = btoa(String.fromCharCode(...expiresBytes));
			const encrypted = await encryptData(payload, code, expiresSalt);

			await fetchJson(`/api/cli/auth/${code}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ encrypted_session: encrypted, expires })
			});

			if (timerInterval) clearInterval(timerInterval);
			goto('/cli/success');
		} catch (err: any) {
			error = err.message || 'Login failed.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>CLI Login - diff·log</title>
</svelte:head>

{#if !validCode}
		<div class="cli-card">
			<p class="cli-message">Invalid or expired link.</p>
			<p class="cli-hint">Run <code>difflog login</code> in your terminal to get a new one.</p>
		</div>
	{:else if step === 'expired'}
		<div class="cli-card">
			<p class="cli-message">Session expired.</p>
			<p class="cli-hint">Run <code>difflog login</code> again to start a new session.</p>
		</div>
	{:else if step === 'verify'}
		<div class="cli-card">
			<span class="cli-label">Verification code</span>
			<span class="cli-code">{verificationCode}</span>
			<p class="cli-hint">Check that this matches the code in your terminal.</p>
			<button class="btn-primary cli-action" onclick={confirmCode}>Codes match</button>
		</div>
	{:else if hasProfiles}
		<form class="cli-card" onsubmit={e => { e.preventDefault(); submit(); }}>
			<div class="cli-field">
				<span class="input-label">Select Profile</span>
				<div class="cli-profile-list">
					{#each profileList as p (p.id)}
						<button
							type="button"
							class="cli-profile-card"
							class:selected={profileId === p.id}
							onclick={() => { profileId = p.id; }}
						>
							<div class="cli-profile-icon">
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
									<circle cx="12" cy="11" r="4" />
									<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
								</svg>
							</div>
							<div class="cli-profile-info">
								<div class="cli-profile-header">
									<span class="cli-profile-name">{p.name}</span>
									<span class="cli-profile-badge" class:shared={p.passwordSalt}>
										{p.passwordSalt ? 'Shared' : 'Local'}
									</span>
								</div>
								<span class="cli-profile-id">{p.id.slice(0, 8)}</span>
							</div>
						</button>
					{/each}
				</div>
			</div>

			{#if error}
				<p class="cli-error">{error}</p>
			{/if}

			<button type="submit" class="btn-primary cli-action" disabled={!profileId || submitting}>
				{#if submitting}
					{isShared ? 'Sending...' : 'Copying...'}
				{:else}
					{isShared ? 'Send to CLI' : 'Copy to CLI'}
				{/if}
			</button>
		</form>
	{:else}
		<div class="cli-card">
			<p class="cli-message">No profiles found on this device.</p>

			{#if qrDataUrl}
				<div class="cli-qr">
					<img src={qrDataUrl} alt="QR code to this page" />
				</div>
				<p class="cli-hint">Scan on a device that has your difflog profile.</p>
			{/if}

			<div class="cli-divider">
				<span>or</span>
			</div>

			<a href="/setup" class="btn-primary cli-action">Create a profile</a>
		</div>
{/if}

{#if expires && step !== 'expired' && validCode}
	<span class="cli-timer">{remaining > 0 ? formatTime(remaining) : 'Expired'}</span>
{/if}

<style>
	/* Verification code */
	.cli-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-hint);
	}

	.cli-code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 2.5rem;
		font-weight: 700;
		letter-spacing: 0.3em;
		color: var(--accent);
		padding-left: 0.3em;
	}

	/* Timer */
	.cli-timer {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		color: var(--text-disabled);
	}

	/* Form fields */
	.cli-field {
		width: 100%;
		text-align: left;
	}

	form.cli-card {
		text-align: left;
	}

	/* Profile list */
	.cli-profile-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.cli-profile-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 1rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.cli-profile-card:hover {
		border-color: var(--accent-border);
		background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card-hover) 100%);
	}

	.cli-profile-card.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent-border);
	}

	.cli-profile-icon {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--bg-chip);
		border: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
		transition: all 0.2s ease;
	}

	.cli-profile-card.selected .cli-profile-icon {
		color: var(--accent-glow);
		background: var(--accent-bg);
		border-color: var(--accent-border);
	}

	.cli-profile-info {
		flex: 1;
		min-width: 0;
	}

	.cli-profile-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.cli-profile-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-heading);
	}

	.cli-profile-badge {
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.15rem 0.4rem;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid var(--border-subtle);
	}

	.cli-profile-badge.shared {
		color: var(--text-subtle);
		background: var(--info-bg);
		border-color: var(--info-border);
	}

	.cli-profile-id {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-disabled);
	}

	/* Error */
	.cli-error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0;
		text-align: center;
		width: 100%;
	}

	/* QR code */
	.cli-qr {
		background: #fff;
		padding: 0.5rem;
		border-radius: 0.5rem;
	}

	.cli-qr img {
		display: block;
		width: 160px;
		height: 160px;
		image-rendering: pixelated;
	}

	/* Divider */
	.cli-divider {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--text-disabled);
		font-size: 0.8rem;
	}

	.cli-divider::before,
	.cli-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
</style>

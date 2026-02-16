<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { ModalDialog, InputField } from '$lib/components';
	import { importProfile as importProfileApi, rememberPassword } from '$lib/stores/sync.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	let profileId = $state('');
	let password = $state('');
	let remember = $state(true);
	let error = $state('');
	let importing = $state(false);

	// Scanner state
	let scanning = $state(false);
	let scannerError = $state('');
	let scannerStream: MediaStream | null = null;
	let scannerInterval: ReturnType<typeof setInterval> | null = null;
	let videoEl: HTMLVideoElement;

	let dialog: { open: () => void; close: () => void };

	$effect(() => {
		if (open && dialog) dialog.open();
		else if (dialog) dialog.close();
	});

	// Clear error when inputs change
	$effect(() => {
		profileId;
		password;
		error = '';
	});

	// Clean up scanner when modal closes
	$effect(() => {
		if (!open && scanning) {
			stopScanner();
		}
	});

	onDestroy(() => {
		stopScanner();
	});

	async function startScanner() {
		scannerError = '';
		scanning = true;

		// Dynamically load jsQR
		if (!(window as { jsQR?: unknown }).jsQR) {
			try {
				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script');
					script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
					script.onload = () => resolve();
					script.onerror = () => reject(new Error('Failed to load QR scanner'));
					document.head.appendChild(script);
				});
			} catch {
				scannerError = 'Failed to load QR scanner library.';
				return;
			}
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
			});
			scannerStream = stream;

			videoEl.srcObject = stream;
			await videoEl.play();

			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

			scannerInterval = setInterval(() => {
				if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;

				canvas.width = videoEl.videoWidth;
				canvas.height = videoEl.videoHeight;
				ctx.drawImage(videoEl, 0, 0);

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const jsQR = (window as { jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).jsQR;
				const code = jsQR(imageData.data, canvas.width, canvas.height);

				if (code) {
					const uuidMatch = code.data.match(
						/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
					);
					if (uuidMatch) {
						stopScanner();
						profileId = uuidMatch[0];
					}
				}
			}, 150);
		} catch (err: unknown) {
			const e = err as { name?: string; message?: string };
			if (e.name === 'NotAllowedError') {
				scannerError = 'Camera access denied. Please allow camera access.';
			} else if (e.name === 'NotFoundError') {
				scannerError = 'No camera found on this device.';
			} else {
				scannerError = `Could not access camera: ${e.message || 'Unknown error'}`;
			}
		}
	}

	function stopScanner() {
		if (scannerInterval) {
			clearInterval(scannerInterval);
			scannerInterval = null;
		}
		if (scannerStream) {
			scannerStream.getTracks().forEach((track) => track.stop());
			scannerStream = null;
		}
		scanning = false;
		scannerError = '';
	}

	async function handleImport() {
		const id = profileId.trim();
		if (!id || !password) return;

		error = '';

		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
			error = 'Invalid profile ID format';
			return;
		}

		importing = true;
		try {
			await importProfileApi(id, password);
			if (remember) {
				rememberPassword(password);
			}
			goto('/');
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to import profile';
		} finally {
			importing = false;
		}
	}

	function handleClose() {
		stopScanner();
		password = '';
		open = false;
		error = '';
		onclose();
	}
</script>

<ModalDialog
	bind:this={dialog}
	title="Import Shared Profile"
	subtitle="Sync a profile that's been uploaded to the server from another device."
	error={scanning ? '' : error}
	size="sm"
	dark={true}
	onclose={handleClose}
>
	{#if scanning}
		<div class="scanner-container">
			<!-- svelte-ignore element_invalid_self_closing_tag -->
			<video bind:this={videoEl} class="scanner-video" playsinline />
			<div class="scanner-overlay">
				<div class="scanner-frame"></div>
			</div>
		</div>
		{#if scannerError}
			<p class="scanner-error">{scannerError}</p>
		{/if}
		<button class="btn-secondary" style="width: 100%" onclick={stopScanner}>Cancel Scan</button>
	{:else}
		<div class="import-id-row">
			<div class="import-id-field">
				<InputField
					label="Profile ID"
					placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
					bind:value={profileId}
				/>
			</div>
			<button class="btn-secondary import-scan-btn" title="Scan QR code" onclick={startScanner}>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 7V5a2 2 0 0 1 2-2h2" />
					<path d="M17 3h2a2 2 0 0 1 2 2v2" />
					<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
					<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
					<rect x="7" y="7" width="10" height="10" rx="1" />
				</svg>
			</button>
		</div>

		<InputField
			label="Password"
			type="password"
			placeholder="Enter the share password"
			bind:value={password}
			onkeydown={(e) => e.key === 'Enter' && handleImport()}
		/>

		<label class="remember-password">
			<input type="checkbox" bind:checked={remember} />
			<span>Remember password</span>
		</label>
	{/if}

	{#snippet footer()}
		{#if !scanning}
			<button class="btn-secondary" onclick={() => (open = false)}>Cancel</button>
			<button
				class="btn-primary"
				onclick={handleImport}
				disabled={!profileId.trim() || !password || importing}
			>
				{importing ? 'Importing...' : 'Import'}
			</button>
		{/if}
	{/snippet}
</ModalDialog>

<style>
	.import-id-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.import-id-field {
		flex: 1;
	}

	.import-scan-btn {
		padding: 0.55rem 0.65rem;
		margin-bottom: 1rem;
		flex-shrink: 0;
	}

	.scanner-container {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		background: #000;
		border-radius: var(--radius-md);
		overflow: hidden;
		margin: 1rem 0;
	}

	.scanner-video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.scanner-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.scanner-frame {
		width: 200px;
		height: 200px;
		border: 2px solid var(--accent);
		border-radius: var(--radius-lg);
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
	}

	.scanner-error {
		text-align: center;
		color: var(--danger);
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
</style>

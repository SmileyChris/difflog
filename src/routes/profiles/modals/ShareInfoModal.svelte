<script lang="ts">
	import { ModalDialog } from '$lib/components';

	interface Props {
		open: boolean;
		profileId: string;
		onclose: () => void;
	}

	let { open = $bindable(), profileId, onclose }: Props = $props();

	let qrDataUrl = $state('');
	let copied = $state(false);

	let dialog: { open: () => void; close: () => void };

	$effect(() => {
		if (open && dialog) dialog.open();
		else if (dialog) dialog.close();
	});

	// Generate QR code when modal opens
	$effect(() => {
		if (open && profileId) {
			generateQrCode();
		}
	});

	async function generateQrCode() {
		qrDataUrl = '';
		copied = false;

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
			qr.addData(profileId);
			qr.make();
			qrDataUrl = qr.createDataURL(6, 4);
		} catch {
			// QR generation failed
		}
	}

	async function copyId() {
		try {
			await navigator.clipboard.writeText(profileId);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback - clipboard API failed
		}
	}

	function handleClose() {
		open = false;
		onclose();
	}
</script>

<ModalDialog
	bind:this={dialog}
	title="Share Profile"
	subtitle="Share this profile with another device or person"
	size="sm"
	dark={true}
	onclose={handleClose}
>
	{#if qrDataUrl}
		<div class="share-qr-container">
			<img src={qrDataUrl} alt="QR Code" class="share-qr" />
		</div>
	{/if}

	<div class="share-id-box">
		<label class="input-label">Profile ID</label>
		<div class="share-id-row">
			<code class="share-id-code">{profileId}</code>
			<button class="btn-copy" onclick={copyId}>
				{copied ? 'Copied!' : 'Copy'}
			</button>
		</div>
	</div>

	<p class="share-note">The recipient will need this ID and your password to import the profile.</p>

	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (open = false)}>Close</button>
	{/snippet}
</ModalDialog>

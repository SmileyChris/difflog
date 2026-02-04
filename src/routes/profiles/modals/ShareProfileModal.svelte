<script lang="ts">
	import { ModalDialog, InputField } from '$lib/components';
	import { profiles } from '$lib/stores/profiles.svelte';
	import {
		switchProfileWithSync,
		shareProfile as shareProfileApi,
		rememberPassword,
		checkSyncStatus
	} from '$lib/stores/sync.svelte';

	interface Props {
		open: boolean;
		profileId: string;
		onclose: () => void;
	}

	let { open = $bindable(), profileId, onclose }: Props = $props();

	let password = $state('');
	let passwordConfirm = $state('');
	let remember = $state(true);
	let error = $state('');
	let sharing = $state(false);

	let dialog: { open: () => void; close: () => void };

	$effect(() => {
		if (open && dialog) dialog.open();
		else if (dialog) dialog.close();
	});

	// Reset form when modal opens with new profile
	$effect(() => {
		if (open) {
			password = '';
			passwordConfirm = '';
			error = '';
		}
	});

	async function handleShare() {
		if (!password || password !== passwordConfirm) return;

		error = '';
		sharing = true;

		try {
			switchProfileWithSync(profileId);
			await shareProfileApi(password);
			const profile = profiles.value[profileId];
			profiles.value = {
				...profiles.value,
				[profileId]: { ...profile, syncedAt: new Date().toISOString() }
			};
			if (remember) {
				rememberPassword(password);
			}
			open = false;
			checkSyncStatus();
			onclose();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to share profile';
		} finally {
			sharing = false;
		}
	}

	function handleClose() {
		open = false;
		error = '';
		onclose();
	}
</script>

<ModalDialog
	bind:this={dialog}
	title="Upload Profile"
	subtitle="Your profile data and API key will be encrypted with your password, then uploaded securely."
	{error}
	size="sm"
	dark={true}
	onclose={handleClose}
>
	<div class="prof-info">
		<div class="prof-info-item">
			<span class="prof-info-icon">&#128274;</span>
			<span>Password encrypts your API key locally</span>
		</div>
		<div class="prof-info-item">
			<span class="prof-info-icon">&#9729;</span>
			<span>Encrypted data stored on server</span>
		</div>
		<div class="prof-info-item">
			<span class="prof-info-icon">&#128273;</span>
			<span>Only someone with the password can decrypt</span>
		</div>
	</div>

	<InputField
		label="Choose a password"
		type="password"
		placeholder="Enter a secure password"
		bind:value={password}
	/>

	<InputField
		label="Confirm password"
		type="password"
		placeholder="Re-enter password"
		bind:value={passwordConfirm}
		onkeydown={(e) => e.key === 'Enter' && handleShare()}
	/>

	<label class="remember-password">
		<input type="checkbox" bind:checked={remember} />
		<span>Remember password</span>
	</label>

	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (open = false)}>Cancel</button>
		<button
			class="btn-primary"
			onclick={handleShare}
			disabled={!password || password !== passwordConfirm || sharing}
		>
			{sharing ? 'Uploading...' : 'Upload'}
		</button>
	{/snippet}
</ModalDialog>

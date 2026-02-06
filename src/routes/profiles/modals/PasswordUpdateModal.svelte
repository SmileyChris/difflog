<script lang="ts">
	import { ModalDialog, InputField } from '$lib/components';
	import { activeProfileId } from '$lib/stores/profiles.svelte';
	import { switchProfileWithSync, updatePasswordSync } from '$lib/stores/sync.svelte';

	interface Props {
		open: boolean;
		profileId: string;
		onclose: () => void;
	}

	let { open = $bindable(), profileId, onclose }: Props = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let newPasswordConfirm = $state('');
	let error = $state('');
	let updating = $state(false);
	let success = $state(false);

	let dialog: { open: () => void; close: () => void };

	$effect(() => {
		if (open && dialog) dialog.open();
		else if (dialog) dialog.close();
	});

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			currentPassword = '';
			newPassword = '';
			newPasswordConfirm = '';
			error = '';
			success = false;
		}
	});

	async function handleUpdate() {
		if (!currentPassword || !newPassword) return;
		if (newPassword !== newPasswordConfirm) {
			error = 'Passwords do not match';
			return;
		}
		if (newPassword.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		error = '';
		updating = true;

		try {
			if (profileId !== activeProfileId.value) {
				if (!switchProfileWithSync(profileId)) {
					error = 'Cannot switch profiles while a diff is generating';
					updating = false;
					return;
				}
			}

			await updatePasswordSync(currentPassword, newPassword);
			success = true;

			setTimeout(() => {
				if (success) {
					open = false;
					success = false;
					onclose();
				}
			}, 2000);
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to update password';
		} finally {
			updating = false;
		}
	}

	function handleClose() {
		open = false;
		error = '';
		success = false;
		onclose();
	}
</script>

<ModalDialog
	bind:this={dialog}
	title="Change Password"
	subtitle={success ? undefined : 'Update your sync password. All data will be re-encrypted with the new password.'}
	{error}
	size="sm"
	dark={true}
	onclose={handleClose}
>
	{#if !success}
		<div class="share-info">
			<div class="share-info-item">
				<span class="share-info-icon">&#128274;</span>
				<span>Your API key and data will be re-encrypted</span>
			</div>
			<div class="share-info-item">
				<span class="share-info-icon">&#9729;</span>
				<span>Server data updated atomically</span>
			</div>
			<div class="share-info-item">
				<span class="share-info-icon">&#128273;</span>
				<span>Old password will no longer work</span>
			</div>
		</div>

		<InputField
			label="Current password"
			type="password"
			placeholder="Enter your current password"
			bind:value={currentPassword}
		/>

		<InputField
			label="New password"
			type="password"
			placeholder="At least 8 characters"
			bind:value={newPassword}
		/>

		<InputField
			label="Confirm new password"
			type="password"
			placeholder="Re-enter new password"
			bind:value={newPasswordConfirm}
			onkeydown={(e) => e.key === 'Enter' && handleUpdate()}
		/>
	{:else}
		<div class="sync-result">
			<div class="sync-result-icon">&#10003;</div>
			<p class="sync-result-text">Password updated successfully!</p>
		</div>
	{/if}

	{#snippet footer()}
		{#if !success}
			<button class="btn-secondary" onclick={() => (open = false)}>Cancel</button>
			<button
				class="btn-primary"
				onclick={handleUpdate}
				disabled={!currentPassword || !newPassword || newPassword !== newPasswordConfirm || updating}
			>
				{updating ? 'Updating...' : 'Update Password'}
			</button>
		{:else}
			<button class="btn-primary" onclick={() => (open = false)}>Done</button>
		{/if}
	{/snippet}
</ModalDialog>

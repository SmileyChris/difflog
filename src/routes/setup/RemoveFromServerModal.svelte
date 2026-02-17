<script lang="ts">
	import { ModalDialog, InputField } from '$lib/components';
	import { removeFromServer } from '$lib/stores/sync.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	let password = $state('');
	let error = $state('');
	let removing = $state(false);

	let dialog: { open: () => void; close: () => void };

	$effect(() => {
		if (open && dialog) dialog.open();
		else if (dialog) dialog.close();
	});

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			password = '';
			error = '';
		}
	});

	async function handleRemove() {
		if (!password) return;

		error = '';
		removing = true;

		try {
			await removeFromServer(password);
			open = false;
			onclose();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to remove from server';
		} finally {
			removing = false;
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
	title="Remove from Server"
	subtitle="This will permanently delete your synced profile and all data from the server. Your local data will be kept."
	{error}
	size="sm"
	dark={true}
	onclose={handleClose}
>
	<InputField
		label="Confirm your password"
		type="password"
		placeholder="Enter your sync password"
		bind:value={password}
		onkeydown={(e) => e.key === 'Enter' && handleRemove()}
	/>

	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (open = false)}>Cancel</button>
		<button
			class="btn-danger"
			onclick={handleRemove}
			disabled={!password || removing}
		>
			{removing ? 'Removing...' : 'Remove from server'}
		</button>
	{/snippet}
</ModalDialog>

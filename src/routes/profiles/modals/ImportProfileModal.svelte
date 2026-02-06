<script lang="ts">
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

	let dialog: { open: () => void; close: () => void };

	$effect(() => {
		if (open && dialog) dialog.open();
		else if (dialog) dialog.close();
	});

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
		open = false;
		error = '';
		onclose();
	}
</script>

<ModalDialog
	bind:this={dialog}
	title="Import Shared Profile"
	subtitle="Sync a profile that's been uploaded to the server from another device."
	{error}
	size="sm"
	dark={true}
	onclose={handleClose}
>
	<InputField
		label="Profile ID"
		placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
		bind:value={profileId}
	/>

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

	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (open = false)}>Cancel</button>
		<button
			class="btn-primary"
			onclick={handleImport}
			disabled={!profileId.trim() || !password || importing}
		>
			{importing ? 'Importing...' : 'Import'}
		</button>
	{/snippet}
</ModalDialog>

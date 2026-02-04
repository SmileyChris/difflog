<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import {
		syncing,
		syncError,
		getSyncState,
		getLastSyncedAgo,
		getCachedPassword,
		getHasRememberedPassword,
		forgetPassword
	} from '$lib/stores/sync.svelte';
	import {
		syncDropdownOpen,
		syncDropdownPassword,
		syncDropdownRemember,
		syncResult,
		openSyncDropdown,
		closeSyncDropdown
	} from '$lib/stores/ui.svelte';
	import { doSyncFromDropdown } from '$lib/stores/operations.svelte';

	let wrapperEl = $state<HTMLElement | null>(null);

	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape' && syncDropdownOpen.value) {
				closeSyncDropdown();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (wrapperEl && !wrapperEl.contains(target)) {
			closeSyncDropdown();
		}
	}

	function handleMouseEnter() {
		openSyncDropdown();
	}

	function handleMouseLeave() {
		if (!needsPassword || !syncDropdownOpen.value) {
			closeSyncDropdown();
		}
	}

	function handleKeyPress(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			doSyncFromDropdown();
		}
	}

	const show = $derived(!!getProfile()?.syncedAt);
	const state = $derived(getSyncState());
	const needsPassword = $derived(!getCachedPassword());
	const lastSyncedAgo = $derived(getLastSyncedAgo());
</script>

<svelte:window onclick={handleClickOutside} />

{#if show}
	<div
		class="sync-dropdown-wrapper"
		bind:this={wrapperEl}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
	>
		<button
			class="sync-status"
			title={state === 'syncing' ? 'Syncing...' : 'Sync status'}
			disabled={syncing.value}
		>
			<span class="sync-status-cloud">&#9729;</span>
			{#if state === 'syncing'}
				<span class="sync-status-indicator sync-status-spinning">&#8635;</span>
			{:else if state === 'pending'}
				<span class="sync-status-indicator sync-status-pending">&#9670;</span>
			{:else if state === 'synced'}
				<span class="sync-status-indicator sync-status-ok">&#10003;</span>
				<span class="sync-status-indicator sync-status-hover">&#8635;</span>
			{/if}
		</button>

		{#if syncDropdownOpen.value}
			<div class="sync-dropdown" onclick={(e) => e.stopPropagation()}>
				{#if syncing.value}
					<div class="sync-dropdown-syncing">
						<span class="sync-dropdown-syncing-icon">&#8635;</span>
						<span>Syncing...</span>
					</div>
				{:else if syncResult.value}
					<div class="sync-dropdown-result">
						<span class="sync-dropdown-result-icon">&#10003;</span>
						<span>
							{#if syncResult.value.uploaded || syncResult.value.downloaded}
								{syncResult.value.uploaded ? '↑' + syncResult.value.uploaded : ''}
								{syncResult.value.downloaded ? ' ↓' + syncResult.value.downloaded : ''}
								synced
							{:else}
								In sync
							{/if}
						</span>
					</div>
				{:else if needsPassword}
					<div class="sync-dropdown-form">
						{#if lastSyncedAgo}
							<div class="sync-dropdown-info">
								<span class="sync-paused">Paused</span> (synced {lastSyncedAgo})
							</div>
						{/if}
						<div class="sync-dropdown-input-row">
							<input
								type="password"
								class="sync-dropdown-input"
								placeholder="Password"
								bind:value={syncDropdownPassword.value}
								onkeydown={handleKeyPress}
							/>
							<button
								class="sync-dropdown-btn-icon"
								onclick={() => doSyncFromDropdown()}
								disabled={!syncDropdownPassword.value}
								title="Sync now"
							>
								&#8635;
							</button>
						</div>
						<label class="sync-dropdown-remember">
							<input type="checkbox" bind:checked={syncDropdownRemember.value} />
							<span class="sync-dropdown-remember-text">Remember password</span>
						</label>
						{#if syncError.value}
							<div class="sync-dropdown-error">{syncError.value}</div>
						{/if}
					</div>
				{:else}
					<div class="sync-dropdown-status">
						<span class="sync-dropdown-info">Synced {lastSyncedAgo}</span>
						{#if lastSyncedAgo !== 'just now'}
							<button
								class="sync-dropdown-btn-icon"
								onclick={() => doSyncFromDropdown()}
								title="Sync now"
							>
								&#8635;
							</button>
						{/if}
					</div>
					<button class="sync-dropdown-forget" onclick={() => forgetPassword()}>
						{getHasRememberedPassword() ? 'forget stored password' : 'forget password'}
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

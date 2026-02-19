<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import {
		syncing,
		syncError,
		getSyncState,
		getLastSyncedAgo,
		getCachedPassword,
	} from '$lib/stores/sync.svelte';
	import {
		syncDropdownPassword,
		syncDropdownRemember,
	} from '$lib/stores/ui.svelte';
	import { doSyncFromDropdown } from '$lib/stores/operations.svelte';
	import { DEPTHS } from '$lib/utils/constants';

	interface Props {
		onshare: () => void;
		onshareinfo: () => void;
	}

	let { onshare, onshareinfo }: Props = $props();

	const profile = $derived(getProfile());
	const needsPassword = $derived(!getCachedPassword());
	const lastSyncedAgo = $derived(getLastSyncedAgo());

	const depthLabel = $derived(
		DEPTHS.find((d) => d.id === profile?.depth)?.label ?? profile?.depth ?? ''
	);

	function handleKeyPress(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			doSyncFromDropdown();
		}
	}
</script>

<div class="account-page">
	<div class="account-content">

		<!-- Profile section -->
		<section class="account-section">
			<div class="mobile-account-profile">
				<span class="mobile-account-avatar">&#9670;</span>
				<div class="mobile-account-info">
					<span class="mobile-account-name">{profile?.name || 'Anonymous'}</span>
					{#if profile?.syncedAt && needsPassword}
						<span class="mobile-account-badge mobile-account-paused-badge">sync paused</span>
					{:else if profile?.syncedAt}
						<span class="mobile-account-badge mobile-account-synced">synced</span>
					{:else}
						<span class="mobile-account-badge">local</span>
					{/if}
				</div>
				<a href="/setup?edit=1" class="account-edit" aria-label="Edit name">&#9998;</a>
			</div>

			{#if profile?.syncedAt}
				<div class="account-sync-card">
					{#if syncing.value}
						<div class="mobile-account-sync-status">
							<span class="mobile-account-sync-icon mobile-account-spinning">&#8635;</span>
							<span>Syncing...</span>
						</div>
					{:else if needsPassword}
						<div class="mobile-account-sync-form">
							<div class="mobile-account-sync-info">
								<span class="mobile-account-paused">Paused</span> (synced {lastSyncedAgo})
							</div>
							<div class="mobile-account-sync-row">
								<input
									type="password"
									class="mobile-account-sync-input"
									placeholder="Password"
									bind:value={syncDropdownPassword.value}
									onkeydown={handleKeyPress}
								/>
								<button
									class="mobile-account-sync-btn"
									onclick={() => doSyncFromDropdown()}
									disabled={!syncDropdownPassword.value}
								>
									&#8635;
								</button>
							</div>
							<label class="mobile-account-remember">
								<input type="checkbox" bind:checked={syncDropdownRemember.value} />
								<span>Remember password</span>
							</label>
							{#if syncError.value}
								<div class="mobile-account-error">{syncError.value}</div>
							{/if}
						</div>
					{:else}
						<div class="mobile-account-sync-status">
							<span class="mobile-account-sync-ok">&#10003;</span>
							<span>Synced {lastSyncedAgo}</span>
						</div>
					{/if}
				</div>
			{/if}

			{#if profile?.syncedAt}
				<button class="account-share-btn" onclick={onshareinfo}>
					&#8599; Share profile
				</button>
			{:else}
				<button class="account-share-btn" onclick={onshare}>
					&#8599; Upload &amp; share
				</button>
			{/if}
		</section>


		<!-- Interests section -->
		{#if profile}
			<section class="account-section">
				<h2 class="account-section-title">Interests</h2>

				{#if profile.languages?.length}
					<div class="account-field">
						<div class="account-field-header">
							<span class="account-field-label">Languages</span>
							<a href="/setup?edit=2" class="account-edit-sm" aria-label="Edit languages">&#9998;</a>
						</div>
						<div class="account-chips">
							{#each profile.languages as item}
								<span class="account-tag">{item}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if profile.frameworks?.length}
					<div class="account-field">
						<div class="account-field-header">
							<span class="account-field-label">Frameworks</span>
							<a href="/setup?edit=3" class="account-edit-sm" aria-label="Edit frameworks">&#9998;</a>
						</div>
						<div class="account-chips">
							{#each profile.frameworks as item}
								<span class="account-tag">{item}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if profile.tools?.length}
					<div class="account-field">
						<div class="account-field-header">
							<span class="account-field-label">Tools</span>
							<a href="/setup?edit=4" class="account-edit-sm" aria-label="Edit tools">&#9998;</a>
						</div>
						<div class="account-chips">
							{#each profile.tools as item}
								<span class="account-tag">{item}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if profile.topics?.length}
					<div class="account-field">
						<div class="account-field-header">
							<span class="account-field-label">Topics</span>
							<a href="/setup?edit=5" class="account-edit-sm" aria-label="Edit topics">&#9998;</a>
						</div>
						<div class="account-chips">
							{#each profile.topics as item}
								<span class="account-tag">{item}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if depthLabel}
					<div class="account-field">
						<div class="account-field-header">
							<span class="account-field-label">Depth</span>
						</div>
						<span class="account-depth">{depthLabel}</span>
					</div>
				{/if}
			</section>
		{/if}

	</div>
</div>

<style>
	.account-sync-card {
		background: var(--bg-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		padding: 0.875rem 1rem;
	}

	.account-share-btn {
		background: none;
		border: 1px solid var(--info-border);
		border-radius: var(--radius);
		color: var(--info);
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		width: 100%;
		transition: background 0.15s, border-color 0.15s;
	}

	.account-share-btn:hover {
		background: var(--info-bg);
		border-color: var(--info);
	}

	.mobile-account-paused-badge {
		color: var(--warning);
	}

	.account-page {
		display: flex;
		justify-content: center;
		padding: 1.25rem 1.25rem 2rem;
		min-height: 100%;
	}

	.account-content {
		width: 100%;
		max-width: 24rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.account-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.account-section-title {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-disabled);
		margin: 0;
	}

	.account-edit {
		margin-left: auto;
		color: var(--text-disabled);
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.25rem;
		transition: color 0.15s;
	}

	.account-edit:hover {
		color: var(--accent);
	}

	.account-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.account-field-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.account-field-label {
		font-size: 0.75rem;
		color: var(--text-subtle);
		font-weight: 500;
	}

	.account-edit-sm {
		color: var(--text-disabled);
		text-decoration: none;
		font-size: 0.7rem;
		padding: 0.1rem 0.2rem;
		transition: color 0.15s;
	}

	.account-edit-sm:hover {
		color: var(--accent);
	}

	.account-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.account-depth {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-subtle);
	}

	.account-tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-hint);
		background: var(--bg-chip);
		padding: 0.2rem 0.45rem;
		border-radius: var(--radius-sm);
		letter-spacing: 0.02em;
	}
</style>

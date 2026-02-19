<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile, profiles, activeProfileId } from '$lib/stores/profiles.svelte';
	import { switchProfileWithSync, getCachedPassword } from '$lib/stores/sync.svelte';
	import { showImportModal } from '$lib/stores/ui.svelte';
	import '../../../styles/mobile.css';

	const profile = $derived(getProfile());
	const needsPassword = $derived(!!profile?.syncedAt && !getCachedPassword());

	const otherProfiles = $derived(
		Object.entries(profiles.value)
			.filter(([id]) => id !== activeProfileId.value)
			.map(([id, p]) => ({ id, name: p.name, synced: !!p.syncedAt }))
	);

	let switcherOpen = $state(false);

	function handleSwitch(id: string) {
		switcherOpen = false;
		if (!switchProfileWithSync(id)) return;
		goto('/profiles');
	}
</script>

<header class="mobile-header">
	<a href="/about" class="mobile-header-wordmark">diff<span class="mobile-header-diamond">&#9670;</span>log</a>
	{#if profile}
		<button class="mobile-header-profile" onclick={() => switcherOpen = !switcherOpen}>
			<span class="mobile-header-name">{profile.name}</span>
			<span
				class="mobile-header-chevron"
				class:mobile-header-chevron-open={switcherOpen}
				class:mobile-header-chevron-synced={profile?.syncedAt && !needsPassword}
				class:mobile-header-chevron-paused={needsPassword}
			>&#9662;</span>
		</button>
	{/if}
	{#if switcherOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="mobile-header-backdrop" onclick={() => switcherOpen = false}></div>
		<div class="mobile-header-switcher">
			{#each otherProfiles as p}
				<button class="mobile-header-switcher-row" onclick={() => handleSwitch(p.id)}>
					<span class="mobile-header-switcher-diamond">&#9670;</span>
					<span class="mobile-header-switcher-name">{p.name}</span>
					{#if p.synced}
						<span class="mobile-account-badge mobile-account-synced">synced</span>
					{:else}
						<span class="mobile-account-badge">local</span>
					{/if}
				</button>
			{/each}
			{#if otherProfiles.length > 0}
				<div class="mobile-header-switcher-divider"></div>
			{/if}
			<a href="/setup" class="mobile-header-switcher-row" onclick={() => switcherOpen = false}>
				<span class="mobile-header-switcher-icon">+</span>
				<span class="mobile-header-switcher-name">Create new profile</span>
			</a>
			<button class="mobile-header-switcher-row" onclick={() => { switcherOpen = false; showImportModal.value = true; goto('/profiles'); }}>
				<span class="mobile-header-switcher-icon">&#8595;</span>
				<span class="mobile-header-switcher-name">Import profile</span>
			</button>
		</div>
	{/if}
</header>

<style>
	.mobile-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0;
		position: relative;
	}

	.mobile-header-wordmark {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-disabled);
		letter-spacing: -0.01em;
		text-decoration: none;
	}

	.mobile-header-diamond {
		color: var(--accent);
		font-size: 0.6em;
		vertical-align: 0.05em;
	}

	.mobile-header-profile {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0;
	}

	.mobile-header-name {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-hint);
	}

	.mobile-header-chevron {
		font-size: 0.75rem;
		color: var(--text-disabled);
		transition: transform 0.2s;
	}

	.mobile-header-chevron-open {
		transform: rotate(180deg);
	}

	.mobile-header-chevron-synced {
		color: var(--accent);
	}

	.mobile-header-chevron-paused {
		color: var(--warning);
	}

	/* Profile switcher overlay */
	.mobile-header-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
	}

	.mobile-header-switcher {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 201;
		background: var(--bg-surface, var(--bg-card));
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		padding: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		animation: mobile-header-switcher-in 0.2s ease;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
	}

	@keyframes mobile-header-switcher-in {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.mobile-header-switcher-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.65rem;
		background: none;
		border: none;
		border-radius: calc(var(--radius) - 2px);
		font-size: 0.8rem;
		color: var(--text-subtle);
		cursor: pointer;
		text-align: left;
		text-decoration: none;
		transition: background 0.1s, color 0.1s;
		width: 100%;
	}

	.mobile-header-switcher-row:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.mobile-header-switcher-diamond {
		color: var(--accent);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.mobile-header-switcher-name {
		font-size: 0.85rem;
		color: var(--text-primary);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mobile-header-switcher-icon {
		flex-shrink: 0;
		width: 0.7rem;
		text-align: center;
		color: var(--text-disabled);
		font-size: 0.85rem;
	}

	.mobile-header-switcher-divider {
		height: 1px;
		background: var(--border-subtle);
		margin: 0.2rem 0.5rem;
	}
</style>

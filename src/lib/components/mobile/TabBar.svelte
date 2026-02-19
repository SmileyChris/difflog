<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getHistory } from '$lib/stores/history.svelte';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars } from '$lib/stores/stars.svelte';
	import { daysSince } from '$lib/utils/time.svelte';

	const profile = $derived(getProfile());
	const history = $derived(getHistory());
	const latestDiff = $derived(history[0] ?? null);
	const stars = $derived(getStars());
	const hasStars = $derived(stars?.length > 0);
	const isSynced = $derived(!!profile?.syncedAt);

	// Diff age label for current tab
	const diffAgeLabel = $derived.by(() => {
		if (!latestDiff) return '';
		const days = daysSince(latestDiff.generated_at);
		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		return `${days}d ago`;
	});

	// Which tab is active based on current route
	const pathname = $derived(page.url.pathname);

	const isViewingLatestDiff = $derived(
		pathname === '/' ||
		(latestDiff && pathname === `/d/${latestDiff.id}`)
	);

	const isViewingOlderDiff = $derived(
		pathname.startsWith('/d/') && !isViewingLatestDiff
	);

	type Tab = 'current' | 'history' | 'stars' | 'account';

	const activeTab = $derived.by((): Tab | null => {
		if (pathname === '/profiles') return 'account';
		if (pathname === '/stars') return 'stars';
		if (pathname === '/archive' || isViewingOlderDiff) return 'history';
		if (isViewingLatestDiff) return 'current';
		return null;
	});

	function handleTab(tab: Tab) {
		switch (tab) {
			case 'current': goto('/'); break;
			case 'history': goto('/archive'); break;
			case 'stars': goto('/stars'); break;
			case 'account': goto('/profiles'); break;
		}
	}
</script>

{#if profile}
<nav class="mobile-tab-bar">
	<button
		class="mobile-tab"
		class:mobile-tab-active={activeTab === 'current'}
		onclick={() => handleTab('current')}
		aria-label="Current diff"
	>
		<span class="mobile-tab-icon">&#9670;</span>
		{#if diffAgeLabel}
			<span class="mobile-tab-label">{diffAgeLabel}</span>
		{:else}
			<span class="mobile-tab-label">Current</span>
		{/if}
	</button>

	<button
		class="mobile-tab"
		class:mobile-tab-active={activeTab === 'history'}
		onclick={() => handleTab('history')}
		aria-label="History"
	>
		<span class="mobile-tab-icon mobile-tab-multi-diamond">&#9670;</span>
		<span class="mobile-tab-label">Archive</span>
	</button>

	{#if hasStars}
		<button
			class="mobile-tab"
			class:mobile-tab-active={activeTab === 'stars'}
			onclick={() => handleTab('stars')}
			aria-label="Stars"
		>
			<span class="mobile-tab-icon">&#9733;</span>
			<span class="mobile-tab-label">{stars.length} {stars.length === 1 ? 'Star' : 'Stars'}</span>
		</button>
	{/if}

	<button
		class="mobile-tab"
		class:mobile-tab-active={activeTab === 'account'}
		onclick={() => handleTab('account')}
		aria-label="Account"
	>
		<span class="mobile-tab-icon">{isSynced ? '☁' : '●'}</span>
		<span class="mobile-tab-label">{profile?.name || 'Account'}</span>
	</button>
</nav>
{/if}

<style>
	.mobile-tab-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3rem;
		display: flex;
		align-items: center;
		justify-content: space-around;
		background: var(--bg-base);
		border-top: 1px solid var(--border-subtle);
		z-index: 100;
	}

	.mobile-tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		background: none;
		border: none;
		padding: 0.25rem 0;
		cursor: pointer;
		color: var(--text-disabled);
		transition: color 0.15s;
	}

	.mobile-tab-active {
		color: var(--accent);
	}

	.mobile-tab-icon {
		font-size: 1rem;
		line-height: 1;
	}

	.mobile-tab-label {
		font-size: 0.55rem;
		font-weight: 500;
		letter-spacing: 0.03em;
		max-width: 5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Multi-diamond icon for History tab */
	.mobile-tab-multi-diamond {
		position: relative;
	}

	.mobile-tab-multi-diamond::before,
	.mobile-tab-multi-diamond::after {
		content: '◆';
		position: absolute;
		left: 0;
	}

	.mobile-tab-multi-diamond::before {
		opacity: 0.6;
		transform: translateX(0.35em);
	}

	.mobile-tab-multi-diamond::after {
		opacity: 0.3;
		transform: translateX(0.7em);
	}
</style>

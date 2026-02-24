<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getHistory } from '$lib/stores/history.svelte';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars } from '$lib/stores/stars.svelte';
	import { mobileDiff } from '$lib/stores/mobile.svelte';
	import { generating } from '$lib/stores/ui.svelte';
	import { daysSince } from '$lib/utils/time.svelte';

	const profile = $derived(getProfile());
	const history = $derived(getHistory());
	const latestDiff = $derived(history[0] ?? null);
	const stars = $derived(getStars());
	const hasDiffs = $derived(history.length > 0);
	const hasStars = $derived(stars?.length > 0);
	const isSynced = $derived(!!profile?.syncedAt);

	// Diff age label for current tab
	const diffAgeLabel = $derived.by(() => {
		if (!latestDiff) return '';
		const days = daysSince(latestDiff.generated_at);
		if (days <= 0) return 'Today';
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
		if (isViewingLatestDiff || pathname === '/generate' || pathname === '/generate') return 'current';
		return null;
	});

	function handleTab(tab: Tab) {
		switch (tab) {
			case 'current':
				if (!hasDiffs) { goto('/generate'); }
				else if (mobileDiff.navigateBack) { mobileDiff.navigateBack(); }
				else { goto('/'); }
				break;
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
		<span class="mobile-tab-icon" class:mobile-tab-diamond-spin={generating.value}>&#9670;</span>
		{#if diffAgeLabel}
			<span class="mobile-tab-label">{diffAgeLabel}</span>
		{:else}
			<span class="mobile-tab-label">{hasDiffs ? 'Current' : 'Generate'}</span>
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
		<span class="mobile-tab-icon">{#if isSynced}<span class="mobile-tab-cloud">☁</span>{:else}<svg class="mobile-tab-person" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="11" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>{/if}</span>
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
		overflow: hidden;
	}

	.mobile-tab-active {
		color: var(--accent);
	}

	.mobile-tab-icon {
		font-size: 1rem;
		line-height: 1;
	}

	.mobile-tab-diamond-spin {
		animation: diamond-spin 2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
	}

	.mobile-tab-person {
		width: 1rem;
		height: 1rem;
	}

	.mobile-tab-cloud {
		font-size: 1.25rem;
		display: block;
		line-height: 1rem;
		margin-top: -0.2rem;
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

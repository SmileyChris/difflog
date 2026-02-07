<script lang="ts">
	import { onMount } from 'svelte';
	import { browser, dev } from '$app/environment';
	import { STORAGE_KEYS } from '$lib/utils/constants';

	const version = __APP_VERSION__;

	interface Change {
		type: string;
		text: string;
		in: string;
	}

	interface Version {
		version: string;
		date: string;
		summary: string;
		description?: string;
		changes: Change[];
	}

	interface ChangelogData {
		versions: Version[];
	}

	const TYPE_ICONS: Record<string, string> = {
		feature: '✨',
		fix: '🐛'
	};

	let dialogEl: HTMLDialogElement;
	let loading = $state(false);
	let error = $state('');
	let data = $state<ChangelogData | null>(null);
	let lastSeen = $state('');
	let showAll = $state(false);
	let dotDismissed = $state(false);
	let expandedVersions = $state<string[]>([]);

	function compareVersions(a: string, b: string): number {
		const partsA = a.split('.').map(Number);
		const partsB = b.split('.').map(Number);
		for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
			const numA = partsA[i] || 0;
			const numB = partsB[i] || 0;
			if (numA !== numB) return numA - numB;
		}
		return 0;
	}

	const hasUnseen = $derived(lastSeen && version ? compareVersions(version, lastSeen) > 0 : false);
	const showDot = $derived(hasUnseen && !dotDismissed);

	const visibleVersions = $derived.by(() => {
		if (!data) return [];
		if (showAll) return data.versions;

		const visible = data.versions.filter((v) =>
			v.changes.some((c) => c.in && compareVersions(c.in, lastSeen) > 0)
		);

		return visible.length > 0 ? visible : data.versions.slice(0, 1);
	});

	const hiddenCount = $derived(data ? Math.max(0, data.versions.length - visibleVersions.length) : 0);

	onMount(() => {
		lastSeen = localStorage.getItem(STORAGE_KEYS.CHANGELOG_SEEN) || '';
		if (!lastSeen && version) {
			lastSeen = version;
			localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, version);
		}
	});

	async function show() {
		dotDismissed = true;

		if (!data) {
			loading = true;
			error = '';

			try {
				const res = await fetch('/changelog.json');
				if (!res.ok) throw new Error('Failed to load changelog');
				data = await res.json();
			} catch {
				error = 'Could not load changelog';
			} finally {
				loading = false;
			}
		}

		dialogEl?.showModal();
	}

	function hide() {
		dialogEl?.close();
		showAll = false;
		expandedVersions = [];

		if (version && browser) {
			localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, version);
		}
	}

	function isNewChange(change: Change): boolean {
		if (!lastSeen || !change.in) return false;
		return compareVersions(change.in, lastSeen) > 0;
	}

	function hasUnseenChanges(ver: Version): boolean {
		return ver.changes.some((c) => isNewChange(c));
	}

	function isVersionExpanded(ver: Version): boolean {
		return hasUnseenChanges(ver) || expandedVersions.includes(ver.version);
	}

	function toggleVersion(ver: Version) {
		if (expandedVersions.includes(ver.version)) {
			expandedVersions = expandedVersions.filter((v) => v !== ver.version);
		} else {
			expandedVersions = [...expandedVersions, ver.version];
		}
	}

	function getChangeIcon(type: string): string {
		return TYPE_ICONS[type] || '';
	}

	function getChangeFallback(type: string): string {
		return TYPE_ICONS[type] ? '' : type;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<footer class="site-footer">
	<nav class="site-footer-links">
		<a href="/about" class="site-footer-link">About diff·log</a>
		<span class="site-footer-sep">&#9670;</span>
		<a href="/about/privacy" class="site-footer-link">Privacy</a>
		<span class="site-footer-sep">&#9670;</span>
		<a href="/about/terms" class="site-footer-link">Terms</a>
		<span class="site-footer-sep">&#9670;</span>
		<a href="https://smileychris.github.io/difflog/" class="site-footer-link" target="_blank" rel="noopener">
			<span class="heart-red">&hearts;</span> opensource
		</a>
	</nav>
</footer>

<div class="changelog-wrapper">
	{#if dev}
		<a href="/design" class="site-footer-link design-link">Design</a>
	{/if}
	<button class="changelog-btn" onclick={show}>
		v{version}
		{#if showDot}
			<span class="changelog-dot"></span>
		{/if}
	</button>

	<dialog bind:this={dialogEl} class="dialog">
		<header>
			<h2 class="dialog-title">
				{hasUnseen ? "What's new in diff·log" : 'diff·log changes'}
			</h2>
			<button class="dialog-close" onclick={hide}>&times;</button>
		</header>
		<div class="dialog-body">
			{#if loading}
				<p class="changelog-loading">Loading...</p>
			{:else if error}
				<p class="changelog-error">{error}</p>
			{:else if data}
				<div class="changelog-versions">
					{#each visibleVersions as ver (ver.version)}
						<div class="changelog-version">
							<div class="changelog-version-date">{formatDate(ver.date)}</div>
							<p class="changelog-version-summary">
								<span class="changelog-version-num">v{ver.version}</span>
								<span>{ver.summary}</span>
							</p>
							{#if ver.description}
								<p class="changelog-version-desc">
									<span>{ver.description}</span>
									{#if !isVersionExpanded(ver) && ver.changes?.length}
										<a
											href="#changelog"
											class="link-secondary"
											onclick={(e) => {
												e.preventDefault();
												toggleVersion(ver);
											}}
										>
											See highlights
										</a>
									{/if}
								</p>
							{/if}
							{#if isVersionExpanded(ver)}
								<ul class="changelog-changes">
									{#each ver.changes as change (change.text)}
										<li class="changelog-change" class:is-new={isNewChange(change)}>
											{#if getChangeIcon(change.type)}
												<span class="changelog-change-icon">{getChangeIcon(change.type)}</span>
											{/if}
											{#if getChangeFallback(change.type)}
												<span class="changelog-change-type">{getChangeFallback(change.type)}</span>
											{/if}
											<span>{change.text}</span>
											{#if change.in && (!change.in.endsWith('.0') || isNewChange(change))}
												<code class="changelog-change-version">
													{#if isNewChange(change)}
														<span class="changelog-dot-inline"></span>
													{/if}
													<span>{change.in}</span>
												</code>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
					{#if !showAll && hiddenCount > 0}
						<button class="changelog-more" onclick={() => (showAll = true)}>
							{hiddenCount} older
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</dialog>
</div>

<style>
	.design-link {
		margin-right: 0.75rem;
		font-size: 0.75rem;
		opacity: 0.6;
	}
	.design-link:hover {
		opacity: 1;
	}
</style>

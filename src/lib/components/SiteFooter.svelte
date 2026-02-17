<script lang="ts">
	import { onMount } from "svelte";
	import { browser, dev } from "$app/environment";
	import { STORAGE_KEYS } from "$lib/utils/constants";
	import ModalDialog from "./ModalDialog.svelte";

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
		feature: "✨",
		fix: "🐛",
	};

	let dialogEl: ModalDialog;
	let loading = $state(false);
	let error = $state("");
	let data = $state<ChangelogData | null>(null);
	let lastSeen = $state("");
	let showAll = $state(false);
	let dotDismissed = $state(false);
	let expandedVersions = $state<string[]>([]);

	function compareVersions(a: string, b: string): number {
		const partsA = a.split(".").map(Number);
		const partsB = b.split(".").map(Number);
		for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
			const numA = partsA[i] || 0;
			const numB = partsB[i] || 0;
			if (numA !== numB) return numA - numB;
		}
		return 0;
	}

	const hasUnseen = $derived(
		lastSeen && version ? compareVersions(version, lastSeen) > 0 : false,
	);
	const showDot = $derived(hasUnseen && !dotDismissed);

	const visibleVersions = $derived.by(() => {
		if (!data) return [];
		if (showAll) return data.versions;

		const visible = data.versions.filter((v) =>
			v.changes.some((c) => c.in && compareVersions(c.in, lastSeen) > 0),
		);

		return visible.length > 0 ? visible : data.versions.slice(0, 1);
	});

	const hiddenCount = $derived(
		data ? Math.max(0, data.versions.length - visibleVersions.length) : 0,
	);

	onMount(() => {
		lastSeen = localStorage.getItem(STORAGE_KEYS.CHANGELOG_SEEN) || "";
		if (!lastSeen && version) {
			lastSeen = version;
			localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, version);
		}
	});

	async function show() {
		dotDismissed = true;

		if (!data) {
			loading = true;
			error = "";

			try {
				const res = await fetch("/changelog.json");
				if (!res.ok) throw new Error("Failed to load changelog");
				data = await res.json();
			} catch {
				error = "Could not load changelog";
			} finally {
				loading = false;
			}
		}

		dialogEl?.open();
	}

	function onClose() {
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
			expandedVersions = expandedVersions.filter(
				(v) => v !== ver.version,
			);
		} else {
			expandedVersions = [...expandedVersions, ver.version];
		}
	}

	function getChangeIcon(type: string): string {
		return TYPE_ICONS[type] || "";
	}

	function getChangeFallback(type: string): string {
		return TYPE_ICONS[type] ? "" : type;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
</script>

<footer>
	<nav>
		<a href="/about">About diff·log</a>
		<span>&#9670;</span>
		<a href="/about/privacy">Privacy</a>
		<span>&#9670;</span>
		<a href="/about/terms">Terms</a>
		<span>&#9670;</span>
		<a
			href="https://smileychris.github.io/difflog/"
			target="_blank"
			rel="noopener"
		>
			<span class="heart-red">&hearts;</span> opensource
		</a>
	</nav>
</footer>

<div class="changelog-wrapper" class:changelog-sticky={showDot}>
	{#if dev}
		<a href="/design" class="design-link">design system</a>
	{/if}
	<button class="changelog-btn" onclick={show}>
		v{version}
		{#if showDot}
			<span class="changelog-dot"></span>
		{/if}
	</button>

	<ModalDialog
		bind:this={dialogEl}
		title={hasUnseen ? "What's new in diff·log" : "diff·log changes"}
		dark
		onclose={onClose}
	>
		{#if loading}
			<p class="changelog-loading">Loading...</p>
		{:else if error}
			<p class="changelog-error">{error}</p>
		{:else if data}
			<div class="changelog-versions">
				{#each visibleVersions as ver (ver.version)}
					<div class="changelog-version">
						<div class="changelog-version-date">
							{formatDate(ver.date)}
						</div>
						<p class="changelog-version-summary">
							<span class="changelog-version-num"
								>v{ver.version}</span
							>
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
									<li
										class="changelog-change"
										class:is-new={isNewChange(change)}
									>
										{#if getChangeIcon(change.type)}
											<span
												class="changelog-change-icon"
												>{getChangeIcon(
													change.type,
												)}</span
											>
										{/if}
										{#if getChangeFallback(change.type)}
											<span
												class="changelog-change-type"
												>{getChangeFallback(
													change.type,
												)}</span
											>
										{/if}
										<span>{change.text}</span>
										{#if change.in && (!change.in.endsWith(".0") || isNewChange(change))}
											<code
												class="changelog-change-version"
											>
												{#if isNewChange(change)}
													<span
														class="changelog-dot-inline"
													></span>
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
					<button
						class="changelog-more"
						onclick={() => (showAll = true)}
					>
						{hiddenCount} older
					</button>
				{/if}
			</div>
		{/if}
	</ModalDialog>
</div>

<style>
	footer {
		margin-top: auto;
		padding: 1.5rem 0;
		text-align: center;
	}

	nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: lowercase;
	}

	footer a,
	.design-link {
		color: var(--text-disabled);
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	footer a:hover,
	.design-link:hover {
		color: var(--accent);
	}

	nav > span {
		color: var(--accent);
		opacity: 0.5;
		font-size: 0.5em;
		vertical-align: middle;
	}

	.heart-red {
		transition: color 0.15s;
	}

	footer a:hover .heart-red {
		color: #e25555;
	}

	.design-link {
		margin-right: 0.75rem;
		opacity: 0.6;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.design-link:hover {
		opacity: 1;
	}

	/* Changelog */
	.changelog-wrapper {
		text-align: right;
		padding: 0 1rem;
	}

	.changelog-sticky {
		position: fixed;
		bottom: 0;
		right: 0;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: var(--bg-surface);
		border-top-left-radius: var(--radius-lg);
	}

	.changelog-btn {
		background: none;
		border: none;
		cursor: pointer;
		position: relative;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-disabled);
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	.changelog-btn:hover {
		color: var(--accent);
	}

	.changelog-dot {
		position: absolute;
		top: 0;
		right: 0;
		width: 6px;
		height: 6px;
		background: var(--accent);
		border-radius: 50%;
	}

	.changelog-dot-inline {
		display: inline-block;
		width: 4px;
		height: 4px;
		background: var(--accent);
		border-radius: 50%;
		margin-right: 0.25rem;
		vertical-align: middle;
	}

	.changelog-loading,
	.changelog-error {
		text-align: center;
		color: var(--text-subtle);
		padding: 2rem;
	}

	.changelog-error {
		color: var(--error);
	}

	.changelog-versions {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.changelog-version {
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.changelog-version:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.changelog-version-date {
		font-size: 0.8rem;
		color: var(--text-disabled);
		text-align: center;
		margin-bottom: 0.5rem;
	}

	.changelog-version-summary {
		font-size: 0.95rem;
		color: var(--text-heading);
		margin: 0 0 0.25rem 0;
		font-weight: 500;
		text-align: left;
	}

	.changelog-version-num {
		font-family: var(--font-mono);
		color: var(--accent);
		font-weight: 600;
		margin-right: 0.75rem;
	}

	.changelog-version-desc {
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
		color: var(--text-subtle);
		margin: 0 0 0.75rem 0;
		line-height: 1.5;
		text-align: left;
	}

	.changelog-changes {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		text-align: left;
	}

	.changelog-change {
		font-size: 0.8rem;
		color: var(--text-subtle);
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.changelog-change.is-new {
		color: var(--text);
	}

	.changelog-change.is-new .changelog-change-version {
		color: var(--accent);
	}

	.changelog-more {
		display: block;
		width: 100%;
		padding: 0.5rem;
		margin-top: 0.5rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-subtle);
		font-size: 0.75rem;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.changelog-more:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.changelog-change-icon {
		font-size: 0.8rem;
		opacity: 0.5;
	}

	.changelog-change-type {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-disabled);
		text-transform: uppercase;
	}

	.changelog-change-version {
		font-size: 0.6rem;
		color: var(--text-disabled);
		margin-left: auto;
		white-space: nowrap;
	}
</style>

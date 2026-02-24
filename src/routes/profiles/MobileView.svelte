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
	import { getHistory, getStreak } from '$lib/stores/history.svelte';
	import { getStars } from '$lib/stores/stars.svelte';
	import { daysSince } from '$lib/utils/time.svelte';
	import { STREAK_TOLERANCE_DAYS } from '$lib/utils/streak';
	import { DEPTHS } from '$lib/utils/constants';
	import { goto } from '$app/navigation';
	import StreakCalendar from '../StreakCalendar.svelte';

	let showStreakCalendar = $state(false);

	const hasActiveStreak = $derived(streak.streak > 1);

	function goToDiffOnDate(isoDate: string) {
		const match = history.find((d) => {
			const dd = new Date(d.generated_at);
			const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
			return iso === isoDate;
		});
		if (match) {
			showStreakCalendar = false;
			goto(`/d/${match.id}`);
		}
	}

	interface Props {
		onshare: () => void;
		onshareinfo: () => void;
	}

	let { onshare, onshareinfo }: Props = $props();

	const profile = $derived(getProfile());
	const needsPassword = $derived(!getCachedPassword());
	const lastSyncedAgo = $derived(getLastSyncedAgo());

	const history = $derived(getHistory());
	const streak = $derived(getStreak());
	const stars = $derived(getStars());

	const diffsText = $derived.by(() => {
		if (history.length === 0) return 'No diffs yet';
		if (history.length === 1) return '1 diff';
		const dates = history.map((d) => new Date(d.generated_at).getTime());
		const days = Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000);
		return `${history.length} diffs spanning ${days} day${days === 1 ? '' : 's'}`;
	});

	const starsText = $derived.by(() => {
		if (stars.length === 0) return 'No stars yet';
		const uniqueDiffs = new Set(stars.map((s) => s.diff_id)).size;
		return `${stars.length} star${stars.length === 1 ? '' : 's'} across ${uniqueDiffs} diff${uniqueDiffs === 1 ? '' : 's'}`;
	});

	const streakText = $derived.by(() => {
		if (history.length === 0) return 'Generate your first diff';
		if (streak.streak > 0 && streak.activeDates.length >= 2) return `${streak.streak} diff streak`;
		if (streak.streak > 0) return 'Diff for two days to start a streak';
		// streak lost — calculate when
		const lastDate = history[0]?.generated_at;
		if (lastDate) {
			const lost = daysSince(lastDate) - STREAK_TOLERANCE_DAYS;
			if (lost > 0) return `Streak lost ${lost} day${lost === 1 ? '' : 's'} ago`;
		}
		return 'Diff for two days to start a streak';
	});

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

				<div class="account-field">
						<a href="/setup?edit=2" class="account-edit-sm" aria-label="Edit languages">&#9998;</a>
						<div class="account-field-body">
							<span class="account-field-label">Languages</span>
							{#if profile.languages?.length}
								<div class="account-chips">
									{#each profile.languages as item}
										<span class="account-tag account-tag-interest">{item}</span>
									{/each}
								</div>
							{:else}
								<span class="account-empty">None selected</span>
							{/if}
						</div>
					</div>

					<div class="account-field">
						<a href="/setup?edit=3" class="account-edit-sm" aria-label="Edit frameworks">&#9998;</a>
						<div class="account-field-body">
							<span class="account-field-label">Frameworks</span>
							{#if profile.frameworks?.length}
								<div class="account-chips">
									{#each profile.frameworks as item}
										<span class="account-tag account-tag-interest">{item}</span>
									{/each}
								</div>
							{:else}
								<span class="account-empty">None selected</span>
							{/if}
						</div>
					</div>

					<div class="account-field">
						<a href="/setup?edit=4" class="account-edit-sm" aria-label="Edit tools">&#9998;</a>
						<div class="account-field-body">
							<span class="account-field-label">Tools</span>
							{#if profile.tools?.length}
								<div class="account-chips">
									{#each profile.tools as item}
										<span class="account-tag account-tag-interest">{item}</span>
									{/each}
								</div>
							{:else}
								<span class="account-empty">None selected</span>
							{/if}
						</div>
					</div>

					<div class="account-field">
						<a href="/setup?edit=5" class="account-edit-sm" aria-label="Edit topics">&#9998;</a>
						<div class="account-field-body">
							<span class="account-field-label">Topics</span>
							{#if profile.topics?.length}
								<div class="account-chips">
									{#each profile.topics as item}
										<span class="account-tag account-tag-interest">{item}</span>
									{/each}
								</div>
							{:else}
								<span class="account-empty">None selected</span>
							{/if}
						</div>
					</div>

				<div class="account-field">
					<a href="/setup?edit=6" class="account-edit-sm" aria-label="Edit depth">&#9998;</a>
					<div class="account-field-body">
						<span class="account-field-label">Default Depth</span>
						<div class="account-chips">
							{#each DEPTHS as d}
								<span class="account-tag" class:account-tag-active={(profile.depth || 'standard') === d.id}>{d.icon} {d.label}</span>
							{/each}
						</div>
					</div>
				</div>

				{#if profile.customFocus}
					<div class="account-field">
						<a href="/setup?edit=6" class="account-edit-sm" aria-label="Edit focus">&#9998;</a>
						<div class="account-field-body">
							<span class="account-field-label">Focus</span>
							<span class="account-focus">{profile.customFocus}</span>
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<footer class="account-stats">
			<a href="/archive" class="account-stat-line"><span class="account-stat-icon">&#9670;</span> <span class="account-stat-text">{diffsText}</span></a>
			<a href="/stars" class="account-stat-line"><span class="account-stat-icon">&#9733;</span> <span class="account-stat-text">{starsText}</span></a>
			{#if hasActiveStreak}
				<button class="account-stat-line account-stat-btn" onclick={() => showStreakCalendar = true}><span class="account-stat-icon">&#128293;</span> <span class="account-stat-text">{streakText}</span></button>
			{:else}
				<span class="account-stat-line"><span class="account-stat-icon">&#128293;</span> {streakText}</span>
			{/if}
		</footer>

	</div>
</div>

{#if showStreakCalendar}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="streak-overlay" onclick={() => showStreakCalendar = false}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="streak-panel" onclick={(e) => e.stopPropagation()}>
			<StreakCalendar onDayClick={goToDiffOnDate} />
		</div>
	</div>
{/if}

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
		min-height: calc(100dvh - 5.5rem);
	}

	.account-content {
		width: 100%;
		max-width: 24rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		flex: 1;
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
		font-size: 1.1rem;
		padding: 0.35rem;
		transition: color 0.15s;
	}

	.account-edit:hover {
		color: var(--accent);
	}

	.account-field {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.account-field-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
	}

	.account-field-label {
		font-size: 0.75rem;
		color: var(--text-subtle);
		font-weight: 500;
	}

	.account-edit-sm {
		color: var(--text-disabled);
		text-decoration: none;
		font-size: 1rem;
		padding: 0.15rem 0.25rem;
		transition: color 0.15s;
		flex-shrink: 0;
	}

	.account-edit-sm:hover {
		color: var(--accent);
	}

	.account-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
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

	.account-tag-interest {
		border: 1px solid var(--accent-border);
	}

	.account-tag-active {
		color: var(--accent);
		background: var(--accent-bg);
	}

	.account-empty {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-disabled);
		font-style: italic;
	}

	.account-focus {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-subtle);
		font-style: italic;
	}

	.account-stats {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding-top: 1.5rem;
	}

	.account-stat-icon {
		font-size: 0.85rem;
		color: var(--accent);
	}

	.account-stat-line {
		font-size: 0.7rem;
		color: var(--text-disabled);
		text-decoration: none;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
	}

	a.account-stat-line .account-stat-text,
	.account-stat-btn .account-stat-text {
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 0.2em;
		text-decoration-color: var(--text-disabled);
	}

	a.account-stat-line:hover,
	.account-stat-btn:hover {
		color: var(--text-subtle);
	}

	.account-stat-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	/* Streak calendar overlay */
	.streak-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 60;
		animation: streak-fade-in 0.15s ease;
	}

	.streak-panel {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 1rem;
		min-width: 80vw;
	}

	.streak-panel :global(.streak-badge) {
		display: none;
	}

	.streak-panel :global(.streak-wrapper) {
		display: block;
	}

	.streak-panel :global(.streak-dropdown) {
		position: static;
		opacity: 1;
		visibility: visible;
		transform: none;
		pointer-events: auto;
		transition: none;
		background: transparent;
		border: none;
		box-shadow: none;
		padding: 0;
		min-width: auto;
		width: 100%;
	}

	.streak-panel :global(.streak-dropdown::before) {
		display: none;
	}

	@keyframes streak-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>

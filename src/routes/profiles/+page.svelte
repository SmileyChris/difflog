<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { profiles, activeProfileId, isDemoProfile } from '$lib/stores/profiles.svelte';
	import { histories } from '$lib/stores/history.svelte';
	import { bookmarks } from '$lib/stores/stars.svelte';
	import {
		switchProfileWithSync,
		deleteProfileWithSync,
		hasRememberedPasswordFor
	} from '$lib/stores/sync.svelte';
	import { Card, IconButton, SyncDropdown, SiteFooter, PageHeader } from '$lib/components';
	import DetailRow from './DetailRow.svelte';
	import {
		ImportProfileModal,
		ShareProfileModal,
		ShareInfoModal,
		PasswordUpdateModal
	} from './modals';

	// Modal visibility state
	let showImport = $state(false);
	let showShare = $state(false);
	let showInfo = $state(false);
	let showPasswordUpdate = $state(false);

	// Modal context (which profile the modal is operating on)
	let modalProfileId = $state('');

	onMount(() => {
		if (sessionStorage.getItem('openImport')) {
			sessionStorage.removeItem('openImport');
			showImport = true;
		}
	});

	function handleSwitchProfile(id: string) {
		if (!switchProfileWithSync(id)) return;
		goto('/');
	}

	function handleDeleteProfile(id: string) {
		const profile = profiles.value[id];
		if (confirm(`Delete "${profile?.name || 'this profile'}"? This cannot be undone.`)) {
			deleteProfileWithSync(id);
		}
	}

	async function handleEditProfile(id: string, step = 0) {
		if (!switchProfileWithSync(id)) return;
		await tick();
		goto(`/setup?edit=${step}`);
	}

	function startShare(id: string) {
		modalProfileId = id;
		showShare = true;
	}

	function showShareInfo(id: string) {
		modalProfileId = id;
		showInfo = true;
	}

	function startPasswordUpdate(id: string) {
		modalProfileId = id;
		showPasswordUpdate = true;
	}

	function formatSyncDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getDiffCount(id: string): number {
		return (histories.value[id] || []).length;
	}

	function getStarCount(id: string): number {
		return (bookmarks.value[id] || []).length;
	}
</script>

<svelte:head>
	<title>diff·log - Profiles</title>
</svelte:head>

<PageHeader pageTitle="profiles" subtitle="Manage your profiles" icon="user" />

<main id="content">
	{#if Object.keys(profiles.value).length > 0}
		<div class="profiles-section">
			<h2 class="profiles-section-title">Your Profiles</h2>
			{#if Object.keys(profiles.value).length > 1}
				<p class="profiles-section-desc">Click to switch</p>
			{/if}

			<div class="profiles-list">
				{#each Object.entries(profiles.value) as [id, profile] (id)}
					<Card clickable={true} active={id === activeProfileId.value} onclick={() => handleSwitchProfile(id)}>
						{#snippet header()}
							<div class="profile-card-icon">
								<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
									<circle cx="12" cy="11" r="4" />
									<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
								</svg>
							</div>
							<div class="profile-card-full-title">
								<div class="profile-card-name">
									<span>{profile.name}</span>
									{#if profile.syncedAt}
										<span class="profile-status profile-status-shared">synced {formatSyncDate(profile.syncedAt)}</span>
										<button class="profile-status-share" onclick={(e) => { e.stopPropagation(); showShareInfo(id); }}>&#8599; share</button>
									{:else if profile.syncedAt === null}
										<span class="profile-status profile-status-warning" title="Profile not found on server">not on server</span>
									{:else}
										<span class="profile-status profile-status-local">local</span>
									{/if}
									{#if !profile.syncedAt && !isDemoProfile(profile)}
										<button class="profile-status-share" onclick={(e) => { e.stopPropagation(); startShare(id); }}>&#8599; upload</button>
									{/if}
								</div>
								<div class="profile-card-id">
									<span>{id.slice(0, 8)}</span>
									{#if id === activeProfileId.value}
										<SyncDropdown />
									{:else if profile.syncedAt}
										<span class="sync-status-static" title={hasRememberedPasswordFor(id) ? 'Synced' : 'Password required'}>
											<span class="sync-status-cloud">&#9729;</span>
											{#if !hasRememberedPasswordFor(id)}
												<span class="sync-status-indicator sync-status-pending">&#9670;</span>
											{/if}
										</span>
									{/if}
								</div>
							</div>
							<div class="profile-card-full-actions">
								<button
									class="profile-card-edit"
									title="Edit profile"
									onclick={(e) => { e.stopPropagation(); handleEditProfile(id); }}
								>&#9998;</button>
								{#if profile.syncedAt}
									<IconButton
										icon="***"
										variant="subtle"
										title="Change password"
										onclick={(e) => { e.stopPropagation(); startPasswordUpdate(id); }}
									/>
								{/if}
								<IconButton
									icon="×"
									variant="danger"
									title="Delete profile"
									onclick={(e) => { e.stopPropagation(); handleDeleteProfile(id); }}
								/>
							</div>
						{/snippet}

						{#snippet details()}
							{#if profile.languages?.length}
								<DetailRow label="Languages" value={profile.languages.join(', ')} onedit={() => handleEditProfile(id, 2)} />
							{/if}
							{#if profile.frameworks?.length}
								<DetailRow label="Frameworks" value={profile.frameworks.join(', ')} onedit={() => handleEditProfile(id, 3)} />
							{/if}
							{#if profile.tools?.length}
								<DetailRow label="Tools" value={profile.tools.join(', ')} onedit={() => handleEditProfile(id, 4)} />
							{/if}
							{#if profile.topics?.length}
								<DetailRow label="Topics" value={profile.topics.join(', ')} onedit={() => handleEditProfile(id, 5)} />
							{/if}
							<div class="profile-detail-row profile-detail-counts">
								<a href="/archive" class="profile-count profile-count-link" onclick={(e) => { e.stopPropagation(); if (activeProfileId.value !== id && !switchProfileWithSync(id)) e.preventDefault(); }}>
									<span class="profile-count-icon">&#9632;</span>
									<span class="link-secondary">{getDiffCount(id)} {getDiffCount(id) === 1 ? 'diff' : 'diffs'}</span>
								</a>
								{#if getStarCount(id) > 0}
									<a href="/stars" class="profile-count profile-count-link" onclick={(e) => { e.stopPropagation(); if (activeProfileId.value !== id && !switchProfileWithSync(id)) e.preventDefault(); }}>
										<span class="profile-count-icon">★</span>
										<span class="link-secondary">{getStarCount(id)} {getStarCount(id) === 1 ? 'star' : 'stars'}</span>
									</a>
								{/if}
							</div>
						{/snippet}
					</Card>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Action Cards -->
	<div class="profiles-actions">
		<a href="/setup" style="text-decoration: none;">
			<Card variant="action" clickable={true}>
				<div class="profile-card-action-icon">+</div>
				<div class="profile-card-name">Create New</div>
				<div class="profile-card-id">Configure your personalized diff</div>
			</Card>
		</a>

		<Card variant="action" clickable={true} onclick={() => (showImport = true)}>
			<div class="profile-card-action-icon">&#8595;</div>
			<div class="profile-card-name">Import Existing</div>
			<div class="profile-card-id">Add from another device</div>
		</Card>
	</div>

	<!-- Modals -->
	<ImportProfileModal
		bind:open={showImport}
		onclose={() => {}}
	/>

	<ShareProfileModal
		bind:open={showShare}
		profileId={modalProfileId}
		onclose={() => {}}
	/>

	<ShareInfoModal
		bind:open={showInfo}
		profileId={modalProfileId}
		onclose={() => {}}
	/>

	<PasswordUpdateModal
		bind:open={showPasswordUpdate}
		profileId={modalProfileId}
		onclose={() => {}}
	/>
</main>

<SiteFooter />

<style>
	.profiles-section-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-heading);
		margin: 0 0 0.5rem 0;
	}

	.profiles-section-desc {
		font-size: 0.85rem;
		color: var(--text-hint);
		margin: 0 0 1rem 0;
	}

	/* Profile cards and statuses */
	:global(.profile-card) {
		position: relative;
		padding: 1.25rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	:global(.profile-card:hover) {
		border-color: var(--accent-border);
		background: linear-gradient(
			135deg,
			var(--bg-card) 0%,
			var(--bg-card-hover) 100%
		);
	}

	:global(.profile-card-active) {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent-border);
	}

	:global(.profile-card-active .profile-card-icon) {
		color: var(--accent-glow);
	}

	:global(.profile-card-icon) {
		font-size: 1.5rem;
		color: var(--accent);
		margin-bottom: 0.75rem;
	}

	:global(.profile-card-name) {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-heading);
		margin-bottom: 0.25rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.profile-status) {
		font-size: 0.65rem;
		font-weight: 500;
		padding: 0.15rem 0.4rem;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	:global(.profile-status-share) {
		font-size: 0.65rem;
		font-weight: 500;
		padding: 0.15rem 0.4rem;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--info);
		background: transparent;
		border: 1px solid var(--info-border);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	:global(.profile-status-share:hover) {
		background: var(--info-bg);
		border-color: var(--info);
		filter: none;
	}

	:global(.profile-card-id) {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		line-height: 1.5rem;
		margin-bottom: -0.5rem;
		font-size: 0.75rem;
		color: var(--text-disabled);
		font-family: var(--font-mono);
	}

	:global(.profile-count) {
		font-size: 0.65rem;
		color: var(--text-disabled);
		letter-spacing: 0.1em;
	}

	:global(.profile-count-link) {
		text-decoration: none;
	}

	:global(.profile-count-link:hover .link-secondary) {
		color: var(--accent);
	}

	:global(.profile-count-icon) {
		color: var(--accent);
	}

	.profiles-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.profile-card-full-title {
		flex: 1;
	}

	.profile-card-full-title .profile-card-name {
		margin-bottom: 0.125rem;
	}

	.profile-card-full-actions {
		display: flex;
		gap: 0.5rem;
		opacity: 0;
		transition: opacity 0.15s;
	}

	:global(.card):hover .profile-card-full-actions {
		opacity: 1;
	}

	.profile-card-edit {
		background: none;
		border: none;
		color: var(--text-subtle);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		text-decoration: none;
		transition: color 0.15s;
	}

	.profile-card-edit:hover {
		color: var(--accent);
	}

	.profile-detail-row {
		display: flex;
		gap: 0.75rem;
		font-size: 0.8rem;
	}

	.profile-detail-counts {
		margin-top: 0.25rem;
		gap: 1rem;
	}

	.profile-status-local {
		color: var(--text-subtle);
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid var(--border-subtle);
	}

	.profile-status-shared {
		color: var(--text-subtle);
		background: var(--info-bg);
		border: 1px solid var(--info-border);
	}

	.profile-status-warning {
		color: var(--warning);
		background: var(--warning-bg);
		border: 1px solid var(--warning-border);
	}

	.sync-status-static {
		display: inline-flex;
		align-items: center;
		position: relative;
		opacity: 0.6;
	}

	.sync-status-static .sync-status-cloud {
		font-size: 1.4rem;
		color: var(--text-hint);
		line-height: 1;
	}

	.sync-status-static .sync-status-indicator {
		position: absolute;
		font-size: 0.5rem;
		font-weight: 700;
		top: 50%;
		right: -0.1rem;
		transform: translateY(-50%);
		line-height: 1;
	}

	/* Action Cards Row */
	.profiles-actions {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-top: 2rem;
	}

	/* Action Card (Create/Import) */
	:global(button.profile-card-action) {
		font: inherit;
		line-height: inherit;
		-webkit-appearance: none;
		appearance: none;
	}

	:global(.profile-card-action) {
		min-height: 140px;
		text-decoration: none;
		text-align: left;
		border: 2px dashed var(--border-subtle);
		background: transparent;
		cursor: pointer;
		transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
	}

	:global(.profile-card-action:hover),
	:global(button.profile-card-action:hover:not(:disabled)) {
		border-color: var(--accent);
		background: linear-gradient(135deg, var(--accent-bg) 0%, transparent 100%);
		box-shadow: 0 0 25px var(--accent-bg);
		filter: none;
	}

	:global(.profile-card-action-alt:hover),
	:global(button.profile-card-action-alt:hover:not(:disabled)) {
		border-color: var(--info);
		background: linear-gradient(135deg, var(--info-bg) 0%, transparent 100%);
		box-shadow: 0 0 25px var(--info-bg);
	}

	:global(.profile-card-action-alt:hover .profile-card-action-icon) {
		background: linear-gradient(135deg, var(--info) 0%, var(--info-muted) 100%);
		box-shadow: 0 0 20px var(--info-glow);
	}

	:global(.profile-card-action-alt:hover .profile-card-name) {
		color: var(--info);
	}

	:global(.profile-card-action-icon) {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		color: var(--text-subtle);
		font-size: 1.5rem;
		font-weight: 300;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.75rem;
		transition: all 0.2s ease;
	}

	:global(.profile-card-action:hover .profile-card-action-icon) {
		background: linear-gradient(135deg, var(--accent) 0%, var(--accent-muted) 100%);
		border-color: transparent;
		color: var(--bg-base);
		transform: scale(1.1);
		box-shadow: 0 0 20px var(--accent-glow);
	}

	:global(.profile-card-action:hover .profile-card-name) {
		color: var(--accent);
	}

	:global(.profile-card-action .profile-card-id) {
		font-family: inherit;
		color: var(--text-subtle);
	}

	@media (max-width: 500px) {
		.profiles-actions {
			grid-template-columns: 1fr;
		}
	}
</style>

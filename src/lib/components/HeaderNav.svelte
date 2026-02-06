<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { SyncDropdown } from '$lib/components';

	const profile = $derived(getProfile());
</script>

<div class="header-nav">
	<a href="/profiles" class="profile-badge">
		<svg class="profile-badge-icon" viewBox="0 0 24 24" fill="currentColor">
			<circle cx="12" cy="11" r="4" />
			<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
		</svg>
		<span>{profile?.name || 'Profile'}</span>
	</a>
	<SyncDropdown />
</div>

<style>
	.header-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.profile-badge {
		font-size: 0.8rem;
		color: var(--text-subtle);
		padding: 0.35rem 0.75rem;
		border-radius: var(--radius);
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		text-decoration: none;
		transition: color 0.15s ease;
		white-space: nowrap;
	}

	.profile-badge:hover {
		color: var(--accent);
	}

	.profile-badge-icon {
		width: 0.875rem;
		height: 0.875rem;
		opacity: 0.8;
	}
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getCachedPassword, autoSync } from '$lib/stores/sync.svelte';
	import { shareDiff, unshareDiff, getPublicDiffUrl } from '$lib/stores/operations.svelte';
	import { type Diff } from '$lib/stores/history.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';

	interface Props {
		diff: Diff;
	}

	let { diff }: Props = $props();

	let isOpen = $state(false);
	let copied = $state(false);

	const canShare = $derived(!!getProfile()?.syncedAt);
	const canModify = $derived(!!getCachedPassword());
	const isPublic = $derived(diff?.isPublic === true);
	const publicUrl = $derived(diff ? getPublicDiffUrl(diff.id) : '');

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		isOpen = !isOpen;
		copied = false;
	}

	function close() {
		isOpen = false;
		copied = false;
	}

	async function share() {
		if (!diff) return;
		if (shareDiff(diff.id)) {
			await autoSync();
		}
	}

	async function unshare() {
		if (!diff) return;
		if (unshareDiff(diff.id)) {
			await autoSync();
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(publicUrl);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

{#if canShare}
	<div class="visibility-menu-wrapper" use:clickOutside={close}>
		<button
			class="visibility-status"
			onclick={toggle}
			title={isPublic ? 'Shared publicly' : 'Private diff'}
			aria-haspopup="true"
			aria-expanded={isOpen}
		>
			<span class="visibility-status-icon" class:visibility-status-public={isPublic}>
				{#if isPublic}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
						<circle cx="12" cy="12" r="3" />
					</svg>
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
						<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
						<path d="M1 1l22 22" />
					</svg>
				{/if}
			</span>
			<span class="visibility-status-label">{isPublic ? 'public' : 'private'}</span>
		</button>

		{#if isOpen}
			<div class="visibility-menu" role="menu" onclick={(e) => e.stopPropagation()}>
				{#if !isPublic}
					<div class="visibility-menu-content">
						{#if canModify}
							<p class="visibility-menu-desc">Make this private diff visible to anyone with the link?</p>
							<button class="visibility-action-btn" onclick={share}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
								Share publicly
							</button>
						{:else}
							<p class="visibility-menu-desc visibility-menu-paused">Sync to share this diff</p>
						{/if}
					</div>
				{:else}
					<div class="visibility-menu-content">
						<div class="visibility-menu-link-row">
							<button
								onclick={() => { close(); goto(`/d/${diff.id}`, { state: { viewAsPublic: true } }); }}
								class="public-link"
							>/d/{diff?.id}</button>
							<button
								class="visibility-menu-btn-icon"
								onclick={copyLink}
								title={copied ? 'Copied!' : 'Copy link'}
							>
								{#if copied}
									<span>&#10003;</span>
								{:else}
									<span>&#128203;</span>
								{/if}
							</button>
						</div>
						{#if canModify}
							<button class="visibility-action-btn visibility-action-btn-danger" onclick={unshare}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
									<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
									<path d="M1 1l22 22" />
								</svg>
								Unshare
							</button>
						{:else}
							<p class="visibility-menu-desc visibility-menu-paused">Sync to unshare</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.visibility-menu-wrapper {
		position: relative;
		display: inline-flex;
	}

	.visibility-status {
		background: none;
		border: none;
		padding: 0.35rem 0.5rem;
		cursor: default;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: var(--radius-sm);
		transition: background 0.15s;
	}

	.visibility-status:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.visibility-status-icon {
		display: flex;
		color: var(--text-hint);
		transition: color 0.15s;
	}

	.visibility-status:hover .visibility-status-icon {
		color: var(--text-subtle);
	}

	.visibility-status-icon.visibility-status-public {
		color: var(--accent);
	}

	.visibility-status:hover .visibility-status-icon.visibility-status-public {
		color: var(--accent);
	}

	.visibility-status-label {
		font-size: 0.7rem;
		color: var(--text-disabled);
		text-transform: lowercase;
	}

	.visibility-status:hover .visibility-status-label {
		color: var(--text-subtle);
	}

	.visibility-status-icon.visibility-status-public + .visibility-status-label {
		color: var(--accent-muted);
	}

	.visibility-menu {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		background: var(--bg-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 0.75rem;
		min-width: 220px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		cursor: default;
		z-index: 1000;
	}

	.visibility-menu-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
	}

	.visibility-menu-desc {
		font-size: 0.85rem;
		color: var(--text-subtle);
		margin: 0;
	}

	.visibility-menu-paused {
		color: var(--warning);
		font-size: 0.8rem;
	}

	.visibility-menu-link-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.public-link {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.public-link:hover {
		text-decoration: underline;
	}

	.visibility-menu-btn-icon {
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		color: var(--text-subtle);
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.visibility-menu-btn-icon:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.visibility-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.5rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		background: linear-gradient(
			135deg,
			var(--accent) 0%,
			var(--accent-muted) 100%
		);
		border: none;
		border-radius: var(--radius);
		color: #000;
		cursor: pointer;
		font-weight: 500;
		width: fit-content;
	}

	.visibility-action-btn:hover {
		filter: brightness(1.1);
	}

	.visibility-action-btn-danger {
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-subtle);
	}

	.visibility-action-btn-danger:hover {
		border-color: var(--danger);
		color: var(--danger);
		filter: none;
	}
</style>

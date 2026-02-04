<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getCachedPassword, autoSync } from '$lib/stores/sync.svelte';
	import { shareDiff, unshareDiff, getPublicDiffUrl } from '$lib/stores/operations.svelte';
	import { type Diff } from '$lib/stores/history.svelte';

	interface Props {
		diff: Diff;
	}

	let { diff }: Props = $props();

	let isOpen = $state(false);
	let copied = $state(false);
	let wrapperEl = $state<HTMLElement | null>(null);

	const canShare = $derived(!!getProfile()?.syncedAt);
	const canModify = $derived(!!getCachedPassword());
	const isPublic = $derived(diff?.isPublic === true);
	const publicUrl = $derived(diff ? getPublicDiffUrl(diff.id) : '');

	function toggle() {
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
			close();
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(publicUrl);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (wrapperEl && !wrapperEl.contains(target)) {
			close();
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

{#if canShare}
	<div class="visibility-menu-wrapper" bind:this={wrapperEl}>
		<button
			class="visibility-status"
			onclick={toggle}
			title={isPublic ? 'Shared publicly' : 'Private diff'}
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
			<div class="visibility-menu" onclick={(e) => e.stopPropagation()}>
				{#if !isPublic}
					<div class="visibility-menu-content">
						{#if canModify}
							<p class="visibility-menu-desc">Make this diff publicly viewable?</p>
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
							<a href={publicUrl} target="_blank" class="public-link">/d/{diff?.id}</a>
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

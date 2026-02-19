<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { isStarred, starId } from '$lib/stores/stars.svelte';
	import { addStar, removeStar } from '$lib/stores/operations.svelte';
	import { getCachedPassword, autoSync } from '$lib/stores/sync.svelte';
	import { shareDiff, unshareDiff, getPublicDiffUrl } from '$lib/stores/operations.svelte';
	import { type Diff } from '$lib/stores/history.svelte';
	import type { FlatCard } from './types';
	import '../../../styles/mobile.css';

	interface Props {
		diff: Diff;
		visibleCard: number;
		flatCards: FlatCard[];
		extraActions?: Snippet;
	}

	let { diff, visibleCard, flatCards, extraActions }: Props = $props();

	let copied = $state(false);

	const onContentCard = $derived(visibleCard > 0 && visibleCard <= flatCards.length);
	const currentCard = $derived(onContentCard ? flatCards[visibleCard - 1] : null);
	const currentPIndex = $derived(currentCard?.pIndex ?? -1);
	const starred = $derived(currentPIndex >= 0 && isStarred(diff.id, currentPIndex));

	const canShare = $derived(!!getProfile()?.syncedAt);
	const canModify = $derived(!!getCachedPassword());
	const isPublic = $derived(diff?.isPublic === true);
	const publicUrl = $derived(diff ? getPublicDiffUrl(diff.id) : '');

	function toggleStar() {
		if (!onContentCard || currentPIndex < 0) return;
		if (starred) {
			removeStar(diff.id, currentPIndex);
		} else {
			addStar({
				diff_id: diff.id,
				p_index: currentPIndex,
				created_at: new Date().toISOString()
			});
		}
	}

	async function toggleShare() {
		if (!diff) return;
		if (isPublic) {
			if (unshareDiff(diff.id)) await autoSync();
		} else {
			if (shareDiff(diff.id)) await autoSync();
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(publicUrl);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}
</script>

<div class="mobile-actions-panel">
	<div class="mobile-actions-list">
		{#if extraActions}{@render extraActions()}{/if}

		<button
			class="focus-end-btn mobile-action-btn"
			class:mobile-action-active={starred}
			disabled={!onContentCard}
			onclick={toggleStar}
		>
			<span class="mobile-action-icon">{starred ? '★' : '☆'}</span>
			{starred ? 'Unstar paragraph' : 'Star paragraph'}
			{#if onContentCard}
				<span class="mobile-action-hint">#{currentPIndex}</span>
			{/if}
		</button>

		{#if canShare}
			<button
				class="focus-end-btn mobile-action-btn"
				class:mobile-action-active={isPublic}
				disabled={!canModify}
				onclick={toggleShare}
			>
				<span class="mobile-action-icon">{isPublic ? '🔓' : '🔒'}</span>
				{isPublic ? 'Unshare diff' : 'Share diff'}
			</button>

			{#if isPublic}
				<button
					class="focus-end-btn mobile-action-btn"
					onclick={copyLink}
				>
					<span class="mobile-action-icon">{copied ? '✓' : '📋'}</span>
					{copied ? 'Copied!' : 'Copy link'}
				</button>
			{/if}
		{/if}

		<a href="/archive" class="focus-end-btn mobile-action-btn">
			<span class="mobile-action-icon">📁</span>
			View in archive
		</a>

		<a href="/d/{diff.id}?scroll=1" class="focus-end-btn mobile-action-btn">
			<span class="mobile-action-icon">📜</span>
			View full scroll
		</a>
	</div>
</div>

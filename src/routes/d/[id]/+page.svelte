<script lang="ts">
	import { onMount } from 'svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { SiteFooter, PageHeader } from '$lib/components';

	let { data } = $props();

	const diff = $derived(data.diff);
	const error = $derived(data.error);
	const renderedContent = $derived(diff?.content ? renderMarkdown(diff.content) : '');

	let contentElement: HTMLElement | null = $state(null);

	function copyParagraphLink(e: MouseEvent, pIndex: number) {
		const url = `${window.location.origin}/d/${data.diff!.id}?p=${pIndex}`;
		navigator.clipboard.writeText(url);

		const toast = document.createElement('span');
		toast.className = 'copy-toast';
		toast.textContent = '\u{1F517} Copied';
		toast.style.left = `${e.clientX}px`;
		toast.style.top = `${e.clientY}px`;
		document.body.appendChild(toast);
		toast.addEventListener('animationend', () => toast.remove());
	}

	onMount(() => {
		if (data.scrollToPIndex !== null) {
			setTimeout(() => {
				const el = document.querySelector(`[data-p="${data.scrollToPIndex}"]`) as HTMLElement;
				if (!el) return;
				el.classList.add('bookmark-highlight-persistent');
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 200);
		}
	});

	$effect(() => {
		if (!contentElement) return;

		contentElement.querySelectorAll('[data-p]').forEach((el) => {
			if (!el.querySelector('a')) return;

			const pIndex = parseInt(el.getAttribute('data-p') || '0', 10);

			const btn = document.createElement('button');
			btn.className = 'copy-link-btn';
			btn.title = 'Copy link to paragraph';
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				copyParagraphLink(e, pIndex);
			});

			el.appendChild(btn);
		});
	});
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - diff·log` : 'diff·log'}</title>
</svelte:head>

<main id="content" class="public-diff-page">
	<PageHeader subtitle={diff?.profile_name ? `shared by ${diff.profile_name}` : 'Shared Diff'} />

	<!-- Error -->
	{#if error}
		<div class="error-box">
			<div class="error-icon">&#9888;&#65039;</div>
			<p class="error-text">{error}</p>
			<a href="/" class="btn-primary" style="margin-top: 1rem;">Go to Home</a>
		</div>
	{/if}

	<!-- Diff Content -->
	{#if diff && !error}
		{#if diff.title}
			<h1 class="public-diff-title">{diff.title}</h1>
		{/if}
		<div class="diff-container">
			<div class="diff-content" bind:this={contentElement}>
				{@html renderedContent}
			</div>
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />

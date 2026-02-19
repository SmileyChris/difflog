<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
</script>

<svelte:head>
	<title>Open Source - diff·log</title>
</svelte:head>

<article>
	<p class="about-intro"><strong class="brand-inline">diff<span class="brand-diamond">&#9670;</span>log</strong> is open source software. You can read, modify, and contribute to the code.</p>

	<section>
		<h3>Source Code</h3>
		<p>The full source code is available on GitHub. Contributions, issues, and feedback are welcome.</p>
		<ul>
			<li><a href="https://github.com/SmileyChris/difflog" target="_blank" rel="noopener">GitHub Repository</a></li>
			<li><a href="https://github.com/SmileyChris/difflog/releases" target="_blank" rel="noopener">Releases</a></li>
			<li><a href="https://github.com/SmileyChris/difflog/issues" target="_blank" rel="noopener">Issues</a></li>
		</ul>
	</section>

	<section>
		<h3>Documentation</h3>
		<p>Developer documentation covers the architecture, sync system, encryption, and more.</p>
		<ul>
			<li><a href="https://smileychris.github.io/difflog/" target="_blank" rel="noopener">Developer Docs</a></li>
		</ul>
	</section>

	<section>
		<h3>Technology</h3>
		<p>Built with SvelteKit, Svelte 5, and deployed on Cloudflare Pages with D1 for optional encrypted sync storage.</p>
	</section>

	{#if !getProfile()}
		<div class="about-cta">
			<a href="/setup" class="splash-cta">
				<span class="splash-cta-icon">&#9670;</span>
				Get Started
			</a>
		</div>
	{/if}
</article>

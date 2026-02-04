<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
</script>

<svelte:head>
	<title>About - diff·log</title>
</svelte:head>

<div class="about-centered">
	<h1 class="splash-title">diff<span class="splash-diamond">&#9670;</span>log</h1>
	<p class="splash-tagline">Catch up on what matters. Your personalized dev diff.</p>

	<div class="splash-features">
		<div class="splash-feature">
			<span class="splash-feature-icon">&#9881;</span>
			<div>
				<strong>Track your stack</strong>
				<span>Languages, frameworks, tools, and topics</span>
			</div>
		</div>
		<div class="splash-feature">
			<span class="splash-feature-icon">&#10024;</span>
			<div>
				<strong>Smart filtering</strong>
				<span>Claude filters the noise for you</span>
			</div>
		</div>
		<div class="splash-feature">
			<span class="splash-feature-icon">&#9889;</span>
			<div>
				<strong>Get the highlights</strong>
				<span>Relevant news, releases, and discussions from HN, GitHub, Reddit, and more</span>
			</div>
		</div>
		<div class="splash-feature">
			<span class="splash-feature-icon">&#128274;</span>
			<div>
				<strong>Private &amp; portable</strong>
				<span>Stored locally in your browser</span>
				<span>Opt-in encrypted sync across devices</span>
			</div>
		</div>
	</div>

	{#if !getProfile()}
		<a href="/setup" class="splash-cta">
			<span class="splash-cta-icon">&#9670;</span>
			Get Started
		</a>
	{/if}

	<p class="splash-note">
		Bring your own <a href="https://console.anthropic.com/settings/keys" target="_blank">Anthropic API key</a> — ~$0.05/diff, full privacy
	</p>
</div>

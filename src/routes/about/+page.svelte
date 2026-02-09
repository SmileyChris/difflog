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
				<span>AI filters the noise for you</span>
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
		Bring your own AI platform key — ~$0.05/diff, full privacy
	</p>
</div>

<style>
	.about-centered {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 3rem 1rem;
		flex: 1;
		min-height: calc(100vh - 10rem);
	}

	.splash-title {
		font-size: 3.5rem;
		font-weight: 700;
		color: var(--text-heading);
		margin: 0 0 0.5rem 0;
		letter-spacing: -0.02em;
	}

	.splash-diamond {
		color: var(--accent);
		font-size: 0.35em;
		vertical-align: 0.35em;
		margin: 0 0.05em;
	}

	.splash-tagline {
		font-size: 1.15rem;
		color: var(--text-subtle);
		margin: 0 0 2.5rem 0;
		line-height: 1.5;
	}

	.splash-features {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 2.5rem;
		text-align: left;
	}

	.splash-feature {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.splash-feature-icon {
		font-size: 1.25rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.splash-feature strong {
		display: block;
		color: var(--text-heading);
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 0.15rem;
	}

	.splash-feature span {
		display: block;
		font-size: 0.8rem;
		color: var(--text-subtle);
		line-height: 1.35;
	}

	@media (max-width: 540px) {
		.splash-features {
			grid-template-columns: 1fr;
		}
	}

	.splash-note {
		margin-top: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-disabled);
	}

	.splash-note :global(a) {
		color: var(--text-subtle);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.splash-note :global(a:hover) {
		color: var(--accent);
	}
</style>

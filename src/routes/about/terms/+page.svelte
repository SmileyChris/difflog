<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
</script>

<svelte:head>
	<title>Terms - diff·log</title>
</svelte:head>

<article>
	<p class="about-intro">By using <strong class="brand-inline">diff<span class="brand-diamond">&#9670;</span>log</strong>, you agree to these terms. Please read them carefully.</p>

	<div class="about-tldr">
		<h3 class="about-tldr-title">TL;DR <span class="about-tldr-aside">(because you're probably not going to read them carefully)</span></h3>
		<ul class="about-tldr-list">
			<li>You handle your own AI platform API usage and costs</li>
			<li>Your content is yours</li>
			<li>As-is, no warranties, no liability for damages</li>
		</ul>
	</div>

	<section>
		<h3>Service Description</h3>
		<p>diff·log is a tool that generates personalized developer ecosystem summaries using AI APIs (such as Anthropic, OpenAI, and Google). The service aggregates publicly available information from various developer-focused sources and uses AI to create curated summaries based on your preferences.</p>
	</section>

	<section>
		<h3>API Key &amp; Costs</h3>
		<p>diff·log requires you to provide your own AI platform API key (Anthropic, OpenAI, or Google). You are solely responsible for:</p>
		<ul>
			<li>Keeping your API keys secure</li>
			<li>All charges incurred through your API key usage</li>
			<li>Compliance with your chosen provider's terms of service</li>
		</ul>
		<p>diff·log does not have access to your API keys — they are stored only in your browser and calls are made directly to the provider.</p>
	</section>

	<section>
		<h3>Acceptable Use</h3>
		<p>You agree not to use diff·log to:</p>
		<ul>
			<li>Violate any laws or regulations</li>
			<li>Infringe on intellectual property rights</li>
			<li>Attempt to reverse engineer, hack, or compromise the service</li>
			<li>Overload or disrupt the service's infrastructure</li>
			<li>Use automated systems to abuse the service</li>
		</ul>
	</section>

	<section>
		<h3>Content Ownership</h3>
		<p>The diffs generated through your use of the service belong to you. However:</p>
		<ul>
			<li>The underlying technology, code, and design of diff·log remain the property of its creators</li>
			<li>Generated content may include information from third-party sources — original authors retain their rights</li>
			<li>AI-generated summaries should not be considered authoritative — always verify important information from original sources</li>
		</ul>
	</section>

	<section>
		<h3>Service Availability</h3>
		<p>diff·log aims for high availability but uptime is not guaranteed. The service may be:</p>
		<ul>
			<li>Temporarily unavailable for maintenance</li>
			<li>Modified, updated, or discontinued at any time</li>
			<li>Affected by third-party service outages (AI providers, Cloudflare, etc.)</li>
		</ul>
	</section>

	<section>
		<h3>Disclaimer of Warranties</h3>
		<p>diff·log is provided "as is" without warranties of any kind, express or implied. There is no guarantee that:</p>
		<ul>
			<li>The service will meet your requirements</li>
			<li>The service will be uninterrupted or error-free</li>
			<li>Generated content will be accurate, complete, or timely</li>
			<li>Any errors will be corrected</li>
		</ul>
	</section>

	<section>
		<h3>Limitation of Liability</h3>
		<p>To the maximum extent permitted by law, diff·log and its creators are not liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:</p>
		<ul>
			<li>Loss of profits, data, or business opportunities</li>
			<li>API costs incurred through your usage</li>
			<li>Actions taken based on generated content</li>
			<li>Service interruptions or data loss</li>
		</ul>
	</section>

	<section>
		<h3>Changes to Terms</h3>
		<p>These terms may be updated from time to time. Continued use of the service after changes constitutes acceptance of the new terms.</p>
	</section>

	<p class="about-updated">Last updated: January 2025</p>

	{#if !getProfile()}
		<div class="about-cta">
			<a href="/setup" class="splash-cta">
				<span class="splash-cta-icon">&#9670;</span>
				Get Started
			</a>
		</div>
	{/if}
</article>

<style>
	.about-updated {
		font-size: 0.8rem;
		color: var(--text-disabled);
		margin-top: 2rem;
		text-align: center;
	}

	.about-tldr-aside {
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
</script>

<svelte:head>
	<title>Privacy - diff·log</title>
</svelte:head>

<article>
	<p class="about-intro"><strong class="brand-inline">diff<span class="brand-diamond">&#9670;</span>log</strong> is designed with privacy at its core. Your data stays on your device unless you explicitly choose to sync it.</p>

	<div class="about-tldr">
		<h3 class="about-tldr-title">TL;DR</h3>
		<ul class="about-tldr-list">
			<li>Your data stays in your browser — we can't see it</li>
			<li>Sync is optional and encrypted; sharing is opt-in</li>
			<li>Minimal analytics (Cloudflare Web Analytics — no cookies, no personal data)</li>
		</ul>
	</div>

	<section>
		<h3>Local-First Architecture</h3>
		<p>Everything you create in diff·log — your profile, preferences, generated diffs, and starred items — is stored locally in your browser's localStorage. This data never automatically transmits to any server. If you clear your browser data or switch browsers, your local data will be lost unless you've enabled cloud sync.</p>
	</section>

	<section>
		<h3>API Key Storage</h3>
		<p>Your AI platform API keys are stored only in your browser's localStorage. When you generate a diff, your browser makes a direct request to the provider's API — our servers never see your keys. This means you have full control over your API usage and costs.</p>
	</section>

	<section>
		<h3>Optional Cloud Sync</h3>
		<p>If you enable cloud sync, your data is encrypted client-side using AES-256-GCM before being uploaded. The encryption key is derived from your password using PBKDF2 with 100,000 iterations. We store only encrypted blobs — we cannot read your data, and neither can anyone who might access our servers.</p>
		<p>Sync is entirely optional. diff·log works fully offline with local-only storage.</p>

		<h4><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -0.1em; margin-right: 0.3rem;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Public Diff Sharing</h4>
		<p>With cloud sync enabled, you can optionally share individual diffs publicly. When you share a diff, it is stored unencrypted so anyone with the link can view it. Public diffs display your profile name alongside the content.</p>
		<p>You retain full control: unsharing a diff re-encrypts it and immediately makes the public link inaccessible. Only the specific diffs you choose to share are public — all other data remains encrypted.</p>
	</section>

	<section>
		<h3>Minimal Analytics</h3>
		<p>diff·log uses Cloudflare Web Analytics, a privacy-first analytics service. It collects only aggregate page view metrics — no cookies, no personal identifiers, no cross-site tracking. We use this to understand basic usage patterns (which pages are visited) without collecting any information about individual users.</p>
		<p>We don't use tracking pixels or other third-party scripts. There are no cookies except what's strictly necessary for the application to function.</p>
	</section>

	<section>
		<h3>Third-Party Services</h3>
		<p>diff·log interacts with the following external services:</p>
		<ul>
			<li><strong>AI providers</strong> (Anthropic, OpenAI, Google) — For generating diffs. Your browser communicates directly with the provider; we don't proxy these requests.</li>
			<li><strong>Feed aggregator</strong> — Our server fetches public RSS/API data from sources like HN, Reddit, and GitHub to provide context for diff generation. No personal data is sent.</li>
			<li><strong>Cloudflare</strong> — For hosting, optional sync storage (encrypted data only), and privacy-first web analytics.</li>
		</ul>
	</section>

	<section>
		<h3>Data Deletion</h3>
		<p>To delete your local data, clear your browser's localStorage for this site.</p>
		<p>If you've enabled cloud sync, you can remove your profile from the server using the "Remove from server" option in profile settings. This requires re-entering your password and permanently deletes all synced data (profile, diffs, and stars) from our servers. Your local data is kept, and the profile reverts to local-only.</p>
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

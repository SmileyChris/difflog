<script lang="ts">
  import { getProfile } from "$lib/stores/profiles.svelte";
  import { isMobile } from "$lib/stores/mobile.svelte";
  import { page } from "$app/state";
  import ChangelogModal from "$lib/components/ChangelogModal.svelte";

  const version = __APP_VERSION__;
  const installUrl = $derived(`${page.url.origin}/install.sh`);

  let changelogEl: ChangelogModal;
  let hasUnseen = $state(false);
</script>

<svelte:head>
  <title>About - diff·log</title>
</svelte:head>

<div class="about-centered">
  <h1 class="splash-title">
    diff<span class="splash-diamond">&#9670;</span>log
  </h1>
  {#if isMobile.value}
    <button class="splash-version" onclick={() => changelogEl?.open()}>
      v{version}
      {#if hasUnseen}
        <span class="splash-version-dot"></span>
      {/if}
    </button>
  {/if}
  <p class="splash-tagline">
    Catch up on what matters. Your personalized dev diff.
  </p>

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
        <span
          >Relevant news, releases, and discussions from HN, GitHub, Reddit, and
          more</span
        >
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

  {#if !isMobile.value}
    <div class="cli-section">
      <div class="cli-header">
        <span class="cli-icon">&gt;<span class="cli-cursor">_</span></span>
        <div>
          <strong>Also available as a CLI</strong>
          <span>Generate and read diffs from your terminal</span>
        </div>
        <div class="cli-links">
          <a
            href="https://github.com/SmileyChris/difflog/releases"
            target="_blank"
            rel="noopener">Releases</a
          >
          <span class="cli-sep">&#183;</span>
          <a
            href="https://smileychris.github.io/difflog/cli/"
            target="_blank"
            rel="noopener">Docs</a
          >
        </div>
      </div>
      <code>
        <span class="bash">$&nbsp;</span>curl -fsSL {installUrl} | sh
        <span class="bash"><br />$&nbsp;</span><span>difflog --help</span>
      </code>
    </div>
  {/if}
</div>

<ChangelogModal bind:this={changelogEl} bind:hasUnseen />

<style>
  .about-centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 1rem;
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

  .splash-version {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: none;
    border: 1px solid var(--border-subtle);
    border-radius: 2rem;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text-subtle);
    margin-bottom: 0.5rem;
    transition: color 0.15s, border-color 0.15s;
  }

  .splash-version:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .splash-version-dot {
    width: 6px;
    height: 6px;
    background: var(--accent);
    border-radius: 50%;
    flex-shrink: 0;
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
    transition: transform 0.2s ease-in-out;
  }

  .splash-feature:hover .splash-feature-icon {
    transform: scale(1.5);
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

  .cli-section {
    width: 100%;
    max-width: 540px;
    margin-top: 1.5rem;
    padding: 1.25rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    text-align: left;
  }

  .cli-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .cli-icon {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.4;
    flex-shrink: 0;
    color: var(--accent);
  }

  .cli-cursor {
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .cli-header strong {
    display: block;
    color: var(--text-heading);
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 0.15rem;
  }

  .cli-header span {
    font-size: 0.8rem;
    color: var(--text-subtle);
  }

  .cli-section {
    margin-bottom: 0.75rem;
  }

  .cli-section code {
    display: block;
    padding: 0.6rem 0.85rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--accent);
    background: var(--bg-base);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    white-space: nowrap;
    overflow-x: auto;
    user-select: all;
  }

  .cli-section code .bash {
    opacity: 0.5;
  }

  .cli-section code span {
    user-select: none;
  }

  .cli-links {
    margin-left: auto;
    font-size: 0.8rem;
    white-space: nowrap;
    align-self: flex-start;
  }

  .cli-links a {
    color: var(--text-subtle);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .cli-links a:hover {
    color: var(--accent);
  }

  .cli-sep {
    color: var(--text-disabled);
    margin: 0 0.35rem;
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

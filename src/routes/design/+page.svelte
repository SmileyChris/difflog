<script lang="ts">
  import { dev } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { PageHeader, InputField, ModalDialog } from '$lib/components';

  // Redirect to home in production
  onMount(() => {
    if (!dev) {
      goto('/');
    }
  });

  let demoDialog: { open: () => void; close: () => void };
  let demoDialogSm: { open: () => void; close: () => void };
  let demoDialogLg: { open: () => void; close: () => void };

  let validValue = $state('Valid input');
  let invalidValue = $state('Invalid input');
  let checkingValue = $state('Checking...');
  let hintValue = $state('');
</script>

<svelte:head>
  <title>Design System | diff·log</title>
</svelte:head>

<style>
  .design-page-hidden {
    display: none;
  }
    .design-nav {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      width: 180px;
      padding: 1.5rem 1rem;
      border-right: 1px solid var(--border);
      overflow-y: auto;
      background: var(--bg-base);
      z-index: 100;
    }
    .design-nav-title {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-hint);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0 0 0.75rem 0;
    }
    .design-nav a {
      display: block;
      font-size: 0.8rem;
      color: var(--text-muted);
      text-decoration: none;
      padding: 0.35rem 0;
      transition: color 0.15s;
    }
    .design-nav a:hover {
      color: var(--accent);
    }
    .design-page {
      padding-left: 180px;
    }
    .design-section {
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    .design-section:last-child {
      border-bottom: none;
    }
    .design-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-subtle);
      margin: 0 0 1.5rem 0;
    }
    .design-subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 1.5rem 0 0.5rem;
    }
    .design-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
    .token-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 0.5rem;
    }
    .token-item {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.5rem;
      background: var(--bg-input);
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .token-preview {
      width: 1rem;
      height: 1rem;
      border-radius: 2px;
      flex-shrink: 0;
      border: 1px solid var(--border-strong);
    }
    .component-demo {
      background: var(--bg-input);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .component-label {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-hint);
      margin-bottom: 0.75rem;
    }
    .component-code {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-subtle);
      background: var(--bg-base);
      padding: 0.75rem;
      border-radius: 4px;
      overflow-x: auto;
    }
  @media (max-width: 700px) {
    .design-nav { display: none; }
    .design-page { padding-left: 0; }
  }
</style>

{#if dev}
<aside class="design-nav">
  <h2 class="design-nav-title">Tokens</h2>
  <a href="#colors">Colors</a>
  <a href="#radii">Border Radius</a>
  <a href="#typography">Typography</a>
  <h2 class="design-nav-title" style="margin-top: 1.5rem;">Components</h2>
  <a href="#buttons">Buttons</a>
  <a href="#forms">Form Elements</a>
  <a href="#links">Links</a>
  <a href="#alerts">Alerts</a>
  <a href="#code">Code</a>
  <a href="#dialogs">Dialogs</a>
  <a href="#loading">Loading</a>
  <h2 class="design-nav-title" style="margin-top: 1.5rem;">Patterns</h2>
  <a href="#chips">Chips</a>
  <a href="#profiles">Profiles</a>
  <a href="#sync">Sync</a>
  <a href="#wizard">Wizard</a>
</aside>

<div class="design-page">
  <main class="narrow">
    <PageHeader subtitle="Design System" />

    <!-- Colors -->
    <section id="colors" class="design-section">
      <h2 class="design-title">Colors</h2>

      <h3 class="design-subtitle">Accent</h3>
      <div class="token-list">
        <div class="token-item"><div class="token-preview" style="background: var(--accent)"></div>--accent</div>
        <div class="token-item"><div class="token-preview" style="background: var(--accent-muted)"></div>--accent-muted</div>
        <div class="token-item"><div class="token-preview" style="background: var(--accent-hover)"></div>--accent-hover</div>
        <div class="token-item"><div class="token-preview" style="background: var(--accent-bg)"></div>--accent-bg</div>
        <div class="token-item"><div class="token-preview" style="background: var(--accent-border)"></div>--accent-border</div>
        <div class="token-item"><div class="token-preview" style="background: var(--accent-glow)"></div>--accent-glow</div>
      </div>

      <h3 class="design-subtitle">Backgrounds</h3>
      <div class="token-list">
        <div class="token-item"><div class="token-preview" style="background: var(--bg-base)"></div>--bg-base</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-surface)"></div>--bg-surface</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-card)"></div>--bg-card</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-card-hover)"></div>--bg-card-hover</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-card-bottom)"></div>--bg-card-bottom</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-input)"></div>--bg-input</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-chip)"></div>--bg-chip</div>
        <div class="token-item"><div class="token-preview" style="background: var(--bg-error)"></div>--bg-error</div>
      </div>

      <h3 class="design-subtitle">Text</h3>
      <div class="token-list">
        <div class="token-item"><div class="token-preview" style="background: var(--text-heading)"></div>--text-heading</div>
        <div class="token-item"><div class="token-preview" style="background: var(--text-primary)"></div>--text-primary</div>
        <div class="token-item"><div class="token-preview" style="background: var(--text-secondary)"></div>--text-secondary</div>
        <div class="token-item"><div class="token-preview" style="background: var(--text-muted)"></div>--text-muted</div>
        <div class="token-item"><div class="token-preview" style="background: var(--text-subtle)"></div>--text-subtle</div>
        <div class="token-item"><div class="token-preview" style="background: var(--text-hint)"></div>--text-hint</div>
        <div class="token-item"><div class="token-preview" style="background: var(--text-disabled)"></div>--text-disabled</div>
      </div>

      <h3 class="design-subtitle">Semantic</h3>
      <div class="token-list">
        <div class="token-item"><div class="token-preview" style="background: var(--danger)"></div>--danger</div>
        <div class="token-item"><div class="token-preview" style="background: var(--danger-muted)"></div>--danger-muted</div>
        <div class="token-item"><div class="token-preview" style="background: var(--warning)"></div>--warning</div>
        <div class="token-item"><div class="token-preview" style="background: var(--warning-bg)"></div>--warning-bg</div>
        <div class="token-item"><div class="token-preview" style="background: var(--warning-border)"></div>--warning-border</div>
        <div class="token-item"><div class="token-preview" style="background: var(--info)"></div>--info</div>
        <div class="token-item"><div class="token-preview" style="background: var(--info-muted)"></div>--info-muted</div>
        <div class="token-item"><div class="token-preview" style="background: var(--info-bg)"></div>--info-bg</div>
        <div class="token-item"><div class="token-preview" style="background: var(--info-border)"></div>--info-border</div>
        <div class="token-item"><div class="token-preview" style="background: var(--info-glow)"></div>--info-glow</div>
        <div class="token-item"><div class="token-preview" style="background: var(--success)"></div>--success</div>
        <div class="token-item"><div class="token-preview" style="background: var(--streak)"></div>--streak</div>
      </div>

      <h3 class="design-subtitle">Borders</h3>
      <div class="token-list">
        <div class="token-item"><div class="token-preview" style="background: var(--border)"></div>--border</div>
        <div class="token-item"><div class="token-preview" style="background: var(--border-subtle)"></div>--border-subtle</div>
        <div class="token-item"><div class="token-preview" style="background: var(--border-mid)"></div>--border-mid</div>
        <div class="token-item"><div class="token-preview" style="background: var(--border-strong)"></div>--border-strong</div>
        <div class="token-item"><div class="token-preview" style="background: var(--border-error)"></div>--border-error</div>
      </div>

      <h3 class="design-subtitle">Markdown</h3>
      <div class="token-list">
        <div class="token-item"><div class="token-preview" style="background: var(--md-border)"></div>--md-border</div>
        <div class="token-item"><div class="token-preview" style="background: var(--md-text)"></div>--md-text</div>
        <div class="token-item"><div class="token-preview" style="background: var(--md-link-underline)"></div>--md-link-underline</div>
        <div class="token-item"><div class="token-preview" style="background: var(--md-link-visited)"></div>--md-link-visited</div>
        <div class="token-item"><div class="token-preview" style="background: var(--md-score)"></div>--md-score</div>
      </div>
    </section>

    <!-- Radii -->
    <section id="radii" class="design-section">
      <h2 class="design-title">Border Radius</h2>
      <div class="design-row" style="gap: 1.5rem;">
        <div style="text-align: center;">
          <div style="width: 4rem; height: 4rem; background: var(--bg-chip); border-radius: var(--radius-sm); border: 1px solid var(--accent-border);"></div>
          <code style="font-size: 0.7rem; color: var(--text-subtle);">--radius-sm</code>
        </div>
        <div style="text-align: center;">
          <div style="width: 4rem; height: 4rem; background: var(--bg-chip); border-radius: var(--radius); border: 1px solid var(--accent-border);"></div>
          <code style="font-size: 0.7rem; color: var(--text-subtle);">--radius</code>
        </div>
        <div style="text-align: center;">
          <div style="width: 4rem; height: 4rem; background: var(--bg-chip); border-radius: var(--radius-md); border: 1px solid var(--accent-border);"></div>
          <code style="font-size: 0.7rem; color: var(--text-subtle);">--radius-md</code>
        </div>
        <div style="text-align: center;">
          <div style="width: 4rem; height: 4rem; background: var(--bg-chip); border-radius: var(--radius-lg); border: 1px solid var(--accent-border);"></div>
          <code style="font-size: 0.7rem; color: var(--text-subtle);">--radius-lg</code>
        </div>
      </div>
    </section>

    <!-- Typography -->
    <section id="typography" class="design-section">
      <h2 class="design-title">Typography</h2>
      <div class="component-demo">
        <p style="font-family: var(--font); font-size: 1rem; margin: 0 0 1rem;">Body text uses Inter at various weights.</p>
        <p style="font-family: var(--font-mono); font-size: 0.9rem; margin: 0;">Monospace uses JetBrains Mono for code and labels.</p>
      </div>
      <div class="component-demo">
        <p style="color: var(--text-heading); font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem;">Heading</p>
        <p style="color: var(--text-primary); margin: 0 0 0.5rem;">Primary text for main content.</p>
        <p style="color: var(--text-secondary); margin: 0 0 0.5rem;">Secondary text for supporting content.</p>
        <p style="color: var(--text-muted); margin: 0 0 0.5rem;">Muted text for less important info.</p>
        <p style="color: var(--text-hint); margin: 0;">Hint text for placeholders and subtle labels.</p>
      </div>
    </section>

    <!-- Buttons -->
    <section id="buttons" class="design-section">
      <h2 class="design-title">Buttons</h2>

      <h3 class="design-subtitle">Variants</h3>
      <div class="component-demo">
        <div class="design-row">
          <button class="btn-primary">Primary</button>
          <button class="btn-secondary">Secondary</button>
          <button class="btn-ghost">Ghost</button>
          <button class="btn-danger">Danger</button>
          <button class="btn-link">Link</button>
        </div>
      </div>
      <div class="component-code">.btn-primary  .btn-secondary  .btn-ghost  .btn-danger  .btn-link</div>

      <h3 class="design-subtitle">Sizes</h3>
      <div class="component-demo">
        <div class="design-row">
          <button class="btn-primary btn-lg">Large</button>
          <button class="btn-primary">Default</button>
          <button class="btn-primary btn-sm">Small</button>
        </div>
      </div>
      <div class="component-code">.btn-lg  (default)  .btn-sm</div>

      <h3 class="design-subtitle">Branded (◆ modifier)</h3>
      <div class="component-demo">
        <div class="design-row">
          <button class="btn-primary btn-lg btn-branded">Generate Diff</button>
          <button class="btn-primary btn-branded">Primary</button>
          <button class="btn-primary btn-sm btn-branded">Regenerate</button>
          <button class="btn-secondary btn-branded">Secondary</button>
          <button class="btn-ghost btn-branded">New Diff</button>
        </div>
      </div>
      <div class="component-code">.btn-branded — adds ◆ via ::before. Composable with any variant + size.</div>

      <h3 class="design-subtitle">States</h3>
      <div class="component-demo">
        <div class="design-row">
          <button class="btn-primary" disabled>Disabled</button>
          <button class="btn-secondary" disabled>Disabled</button>
          <button class="btn-primary btn-lg btn-branded" disabled>Disabled</button>
        </div>
      </div>

      <h3 class="design-subtitle">Loading (aria-busy)</h3>
      <div class="component-demo">
        <div class="design-row">
          <button class="btn-primary btn-sm btn-branded" aria-busy="true">Generating…</button>
          <button class="btn-ghost btn-branded" aria-busy="true">Generating…</button>
        </div>
      </div>
      <div class="component-code">.btn-branded[aria-busy="true"] — spins the ◆ via diamond-spin keyframes</div>
    </section>

    <!-- Form Elements -->
    <section id="forms" class="design-section">
      <h2 class="design-title">Form Elements</h2>

      <div class="component-demo">
        <div class="input-group">
          <label class="input-label">Text Input</label>
          <input type="text" class="text-input" placeholder="Placeholder text" />
        </div>

        <div class="input-group" style="margin-top: 1rem;">
          <label class="input-label">With Action Button</label>
          <div class="input-with-action">
            <input type="text" class="text-input" placeholder="Enter value" />
            <button class="btn-inline-action">Action</button>
          </div>
        </div>

        <div class="input-group" style="margin-top: 1rem;">
          <label class="input-label">Textarea</label>
          <textarea class="text-input" rows="3" placeholder="Enter longer text..."></textarea>
        </div>
      </div>

      <h3 class="design-subtitle">Validation States</h3>
      <div class="component-demo">
        <InputField label="Valid State" bind:value={validValue} status="valid" />
        <div style="margin-top: 1rem;">
          <InputField label="Invalid State" bind:value={invalidValue} status="invalid" />
        </div>
        <div style="margin-top: 1rem;">
          <InputField label="Checking State" bind:value={checkingValue} status="checking" />
        </div>
        <div style="margin-top: 1rem;">
          <InputField label="With Hint Text" bind:value={hintValue} placeholder="Enter value" hint="Helper text for more info." />
        </div>
      </div>
    </section>

    <!-- Links -->
    <section id="links" class="design-section">
      <h2 class="design-title">Links</h2>

      <div class="component-demo">
        <p style="margin: 0 0 1rem;">
          Standard link: <a href="#links" class="md-link">Example link</a> within text.
        </p>
        <p style="margin: 0 0 1rem;">
          Header link style: <a href="#links" class="header-link"><span class="header-link-icon">&#9733;</span> Stars</a>
        </p>
        <p style="margin: 0 0 1rem;">
          Footer link: <a href="#links" class="site-footer-link">Footer Link</a>
        </p>
        <p style="margin: 0;">
          Secondary link: <a href="#links" class="link-secondary">See changes</a> — subtle with dotted underline
        </p>
      </div>
    </section>

    <!-- Alerts -->
    <section id="alerts" class="design-section">
      <h2 class="design-title">Alerts</h2>

      <div class="component-demo" style="background: transparent; padding: 0;">
        <div class="error-box">
          <div class="error-icon">&#9888;&#65039;</div>
          <p class="error-text">Something went wrong. Please try again.</p>
          <button class="btn-retry">Retry</button>
        </div>
      </div>
    </section>

    <!-- Code -->
    <section id="code" class="design-section">
      <h2 class="design-title">Code</h2>

      <div class="component-demo">
        <p style="margin: 0 0 1rem;">Inline code: <code class="md-code">const x = 42;</code> within text.</p>
        <pre class="prompt-text" style="max-height: 150px;">// Code block
function example() {'{'}
  return "Hello, world!";
{'}'}</pre>
      </div>
    </section>

    <!-- Dialogs -->
    <section id="dialogs" class="design-section">
      <h2 class="design-title">Dialogs</h2>

      <div class="component-demo">
        <div class="design-row">
          <button class="btn-secondary" onclick={() => demoDialog?.open()}>Default</button>
          <button class="btn-secondary" onclick={() => demoDialogSm?.open()}>Small Dark</button>
          <button class="btn-secondary" onclick={() => demoDialogLg?.open()}>Large</button>
        </div>
      </div>

      <div class="component-code">&lt;ModalDialog title="Title" size="sm|default|lg" dark?&gt; ... &lt;/ModalDialog&gt;</div>
    </section>

    <!-- Loading -->
    <section id="loading" class="design-section">
      <h2 class="design-title">Loading</h2>

      <div class="component-demo">
        <div class="component-label">Branded Button (aria-busy)</div>
        <div class="design-row">
          <button class="btn-primary btn-branded btn-sm" aria-busy="true">Generating…</button>
          <button class="btn-ghost btn-branded" aria-busy="true">Generating…</button>
        </div>
      </div>

      <div class="component-demo">
        <div class="component-label">Progress Dots</div>
        <div class="scan-progress" style="justify-content: flex-start;">
          <div class="progress-dot progress-dot-active"></div>
          <div class="progress-dot progress-dot-active"></div>
          <div class="progress-dot progress-dot-active"></div>
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
        </div>
      </div>
    </section>

    <!-- Chips -->
    <section id="chips" class="design-section">
      <h2 class="design-title">Chips</h2>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 1rem;">Pill-shaped selection elements used for topics, languages, and tags.</p>

      <div class="component-demo">
        <div class="design-row">
          <span class="chip">Default</span>
          <span class="chip chip-selected">Selected</span>
          <input type="text" class="chip-add-input" placeholder="Add..." />
        </div>
      </div>

      <div class="component-code">.chip  .chip-selected  .chip-add-input</div>
    </section>

    <!-- Profiles -->
    <section id="profiles" class="design-section">
      <h2 class="design-title">Profiles</h2>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 1rem;">Profile cards, badges, and detail rows for profile management.</p>

      <h3 class="design-subtitle">Badge</h3>
      <div class="component-demo">
        <a href="#profiles" class="profile-badge">
          <svg class="profile-badge-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
            <circle cx="12" cy="11" r="4" />
            <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
          <span>Profile Name</span>
        </a>
      </div>

      <h3 class="design-subtitle">Cards</h3>
      <div class="component-demo" style="background: transparent; padding: 0;">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
          <div class="profile-card" style="cursor: default;">
            <div class="profile-card-icon">&#9670;</div>
            <h3 class="profile-card-name">Profile Name</h3>
            <p class="profile-card-id">3 topics, 2 languages</p>
          </div>
          <div class="profile-card profile-card-active" style="cursor: default;">
            <div class="profile-card-icon">&#9670;</div>
            <h3 class="profile-card-name">Active Profile</h3>
            <p class="profile-card-id">Currently selected</p>
          </div>
        </div>
      </div>

      <div class="component-code">.profile-badge  .profile-card  .profile-detail-row  .profile-label</div>
    </section>

    <!-- Sync -->
    <section id="sync" class="design-section">
      <h2 class="design-title">Sync</h2>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 1rem;">Cloud sync status indicators and banners.</p>

      <div class="component-demo" style="background: transparent; padding: 0;">
        <div class="sync-banner" style="position: static;">
          <span class="sync-banner-icon">&#8635;</span>
          <span class="sync-banner-text">You have unsynced changes</span>
          <button class="btn-secondary btn-sm">Sync Now</button>
        </div>
      </div>

      <h3 class="design-subtitle">Stale Banner</h3>
      <div class="component-demo" style="background: transparent; padding: 0;">
        <div class="stale-banner" style="position: static;">
          <span>The dev world moves fast — time to catch up.</span>
          <button class="btn-primary btn-branded stale-banner-btn">Generate new diff</button>
        </div>
      </div>
      <div class="component-demo" style="background: transparent; padding: 0;">
        <div class="stale-banner" style="position: static;">
          <span>Quite a bit has happened. Let's get you back up to speed.</span>
          <button class="btn-ghost btn-branded" aria-busy="true">Generating…</button>
        </div>
      </div>
      <div class="component-code">.stale-banner  .stale-banner-btn — non-dismissible, shown when latest diff is &gt;5 days old</div>
    </section>

    <!-- Wizard -->
    <section id="wizard" class="design-section">
      <h2 class="design-title">Wizard</h2>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 1rem;">Multi-step setup wizard components.</p>

      <h3 class="design-subtitle">Step Indicator</h3>
      <div class="component-demo">
        <div class="step-indicator" style="justify-content: flex-start;">
          <div class="step-dot step-dot-complete"></div>
          <div class="step-dot step-dot-complete"></div>
          <div class="step-dot step-dot-active"></div>
          <div class="step-dot"></div>
          <div class="step-dot"></div>
        </div>
      </div>

      <h3 class="design-subtitle">Step Content</h3>
      <div class="component-demo" style="background: transparent; padding: 0;">
        <div class="setup-content" style="display: block;">
          <h2 class="step-title">Step Title</h2>
          <p class="step-desc">Step description text that explains what this step is for and what the user should do.</p>
          <div class="input-group" style="margin-top: 1rem;">
            <label class="input-label">Example Field</label>
            <input type="text" class="text-input" placeholder="Enter value" />
          </div>
        </div>
      </div>

      <h3 class="design-subtitle">Footer Navigation</h3>
      <div class="component-demo">
        <div class="setup-footer" style="position: static; padding: 0;">
          <button class="btn-secondary">&larr; Back</button>
          <div class="setup-footer-spacer"></div>
          <div class="step-nav-btns">
            <button class="btn-step-nav">&lt;</button>
            <button class="btn-step-nav">&gt;</button>
          </div>
          <button class="btn-primary" style="margin-left: 0.5rem;">Next &rarr;</button>
        </div>
      </div>

      <div class="component-code">.step-indicator  .step-dot  .step-dot-active  .step-dot-complete
.setup-content  .step-title  .step-desc
.setup-footer  .setup-footer-spacer  .step-nav-btns  .btn-step-nav</div>
    </section>

    <!-- Demo Dialogs -->
    <ModalDialog bind:this={demoDialog} title="Default Dialog" onclose={() => demoDialog?.close()}>
      <p>This is the default 500px dialog.</p>
      {#snippet footer()}
        <button class="btn-secondary" onclick={() => demoDialog?.close()}>Cancel</button>
        <button class="btn-primary" onclick={() => demoDialog?.close()}>Confirm</button>
      {/snippet}
    </ModalDialog>

    <ModalDialog bind:this={demoDialogSm} title="Small Dark Dialog" subtitle="Used for forms and confirmations." size="sm" dark onclose={() => demoDialogSm?.close()}>
      <div class="input-group">
        <label class="input-label">Example Field</label>
        <input type="text" class="text-input" placeholder="Enter value" />
      </div>
      {#snippet footer()}
        <button class="btn-secondary" onclick={() => demoDialogSm?.close()}>Cancel</button>
        <button class="btn-primary">Submit</button>
      {/snippet}
    </ModalDialog>

    <ModalDialog bind:this={demoDialogLg} title="Large Dialog" size="lg" onclose={() => demoDialogLg?.close()}>
      <p>This is the large 800px dialog, used for content like previews.</p>
      <pre class="prompt-text">Large content area for code, previews, etc.</pre>
    </ModalDialog>

  </main>

  <footer class="site-footer">
    <nav class="site-footer-links">
      <a href="/" class="site-footer-link">&larr; Back to app</a>
    </nav>
  </footer>
</div>
{/if}

<script lang="ts">
  import { ModalDialog } from "$lib/components";
  import { createShareCode, formatShareCode, peekShareCode } from "$lib/utils/share-code";

  interface Props {
    open: boolean;
    profileId: string;
    onclose: () => void;
  }

  let { open = $bindable(), profileId, onclose }: Props = $props();

  let qrDataUrl = $state("");
  let copied = $state(false);

  // Share code state
  let shareCode = $state("");
  let codeError = $state("");
  let generatingCode = $state(false);
  let codeCopied = $state(false);
  let secondsLeft = $state(0);
  let codeUsed = $state(false);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  let dialog: { open: () => void; close: () => void };

  $effect(() => {
    if (open && dialog) dialog.open();
    else if (dialog) dialog.close();
  });

  // Generate QR code when modal opens
  $effect(() => {
    if (open && profileId) {
      generateQrCode();
    }
  });

  // Clean up timer when modal closes
  $effect(() => {
    if (!open) {
      clearCountdown();
      shareCode = "";
      codeError = "";
      codeUsed = false;
    }
  });

  function clearCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function generateQrCode() {
    qrDataUrl = "";
    copied = false;

    try {
      if (!(window as { qrcode?: unknown }).qrcode) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject();
          document.head.appendChild(script);
        });
      }
      const qrLib = (
        window as {
          qrcode: (
            typeNumber: number,
            errorCorrectionLevel: string,
          ) => {
            addData: (data: string) => void;
            make: () => void;
            createDataURL: (cellSize: number, margin: number) => string;
          };
        }
      ).qrcode;
      const qr = qrLib(0, "M");
      qr.addData(profileId);
      qr.make();
      qrDataUrl = qr.createDataURL(6, 4);
    } catch {
      // QR generation failed
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(profileId);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Fallback - clipboard API failed
    }
  }

  async function handleGenerateCode() {
    generatingCode = true;
    codeError = "";
    shareCode = "";
    codeCopied = false;
    clearCountdown();

    try {
      const result = await createShareCode(profileId);
      shareCode = result.code;
      secondsLeft = 120;

      codeUsed = false;

      countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearCountdown();
          shareCode = "";
        }
      }, 1000);

      // Poll every 3s to detect when the code is consumed
      pollInterval = setInterval(async () => {
        if (!shareCode || codeUsed) return;
        const alive = await peekShareCode(shareCode);
        if (!alive) {
          codeUsed = true;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      }, 3000);
    } catch (e) {
      codeError = e instanceof Error ? e.message : "Failed to generate code";
    } finally {
      generatingCode = false;
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(formatShareCode(shareCode));
      codeCopied = true;
      setTimeout(() => (codeCopied = false), 2000);
    } catch {
      // clipboard API failed
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function handleClose() {
    open = false;
    onclose();
  }
</script>

<ModalDialog
  bind:this={dialog}
  title="Share Profile"
  subtitle="Share this profile with another device or person"
  size="sm"
  dark={true}
  onclose={handleClose}
>
  {#if qrDataUrl}
    <div class="share-qr-container">
      <img src={qrDataUrl} alt="QR Code" class="share-qr" />
    </div>
  {/if}

  <div class="share-id-box">
    <label class="input-label">Profile ID</label>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <code class="share-id-code" onclick={copyId}>{profileId}</code>
    {#if copied}
      <span class="share-copied">Copied!</span>
    {/if}
  </div>

  <div class="share-code-section">
    <label class="input-label">Quick Share Code</label>
    {#if shareCode}
      <div class="share-code-display" class:share-code-used={codeUsed}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <code class="share-code-value" onclick={copyCode}>{formatShareCode(shareCode)}</code>
        {#if codeUsed}
          <span class="share-code-used-label">Code used</span>
        {:else}
          <span class="share-code-timer" class:share-code-timer-warn={secondsLeft <= 30}>
            {formatTime(secondsLeft)}
          </span>
        {/if}
      </div>
      {#if !codeUsed}
        <div class="share-code-progress">
          <div class="share-code-progress-bar" style="width: {(secondsLeft / 120) * 100}%"></div>
        </div>
      {/if}
      {#if codeCopied}
        <span class="share-copied">Copied!</span>
      {/if}
    {:else}
      <button
        class="btn-secondary share-code-btn"
        onclick={handleGenerateCode}
        disabled={generatingCode}
      >
        {generatingCode ? "Generating..." : "Generate Share Code"}
      </button>
      {#if codeError}
        <span class="share-code-error">{codeError}</span>
      {/if}
    {/if}
    <span class="share-code-hint">Single-use code, expires in 2 minutes</span>
  </div>

  <p class="share-note">
    The recipient will need this ID and your password to import the profile.
  </p>

  {#snippet footer()}
    <button class="btn-secondary" onclick={() => (open = false)}>Close</button>
  {/snippet}
</ModalDialog>

<style>
  .share-qr-container {
    display: flex;
    justify-content: center;
    margin-bottom: 1.25rem;
  }

  .share-qr {
    border-radius: var(--radius);
  }

  .share-id-box {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .share-id-code {
    display: block;
    padding: 0.75rem 1rem;
    background: #000;
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: all;
    transition: color 0.15s;
  }

  .share-id-code:hover {
    color: var(--text-primary);
  }

  .share-copied {
    font-size: 0.75rem;
    color: var(--accent);
  }

  .share-code-section {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .share-code-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: #000;
    border-radius: var(--radius);
  }

  .share-code-value {
    font-family: var(--font-mono);
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    letter-spacing: 0.05em;
  }

  .share-code-value:hover {
    opacity: 0.8;
  }

  .share-code-used {
    border: 1px solid var(--accent);
  }

  .share-code-used-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
  }

  .share-code-timer {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .share-code-timer-warn {
    color: var(--danger);
  }

  .share-code-progress {
    height: 3px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
  }

  .share-code-progress-bar {
    height: 100%;
    background: var(--accent);
    transition: width 1s linear;
    border-radius: 2px;
  }

  .share-code-btn {
    width: 100%;
  }

  .share-code-hint {
    font-size: 0.75rem;
    color: var(--text-disabled);
  }

  .share-code-error {
    font-size: 0.85rem;
    color: var(--danger);
  }

  .share-note {
    color: var(--text-disabled);
    margin: 2rem 0 0;
  }
</style>

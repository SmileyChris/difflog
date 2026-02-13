<script lang="ts">
  import { ModalDialog } from "$lib/components";

  interface Props {
    open: boolean;
    profileId: string;
    onclose: () => void;
  }

  let { open = $bindable(), profileId, onclose }: Props = $props();

  let qrDataUrl = $state("");
  let copied = $state(false);

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

  .share-note {
    color: var(--text-disabled);
    margin: 2rem 0 0;
  }
</style>

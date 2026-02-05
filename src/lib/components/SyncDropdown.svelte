<script lang="ts">
  import { onMount } from "svelte";
  import { getProfile } from "$lib/stores/profiles.svelte";
  import {
    syncing,
    syncError,
    getSyncState,
    getLastSyncedAgo,
    getCachedPassword,
    getHasRememberedPassword,
    forgetPassword,
  } from "$lib/stores/sync.svelte";
  import {
    syncDropdownOpen,
    syncDropdownPassword,
    syncDropdownRemember,
    syncResult,
    openSyncDropdown,
    closeSyncDropdown,
  } from "$lib/stores/ui.svelte";
  import { doSyncFromDropdown } from "$lib/stores/operations.svelte";
  import { clickOutside } from "$lib/actions/clickOutside";

  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape" && syncDropdownOpen.value) {
        closeSyncDropdown();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  function handleMouseEnter() {
    openSyncDropdown();
  }

  function handleMouseLeave() {
    if (!needsPassword || !syncDropdownOpen.value) {
      closeSyncDropdown();
    }
  }

  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === "Enter") {
      doSyncFromDropdown();
    }
  }

  const show = $derived(!!getProfile()?.syncedAt);
  const state = $derived(getSyncState());
  const needsPassword = $derived(!getCachedPassword());
  const lastSyncedAgo = $derived(getLastSyncedAgo());
</script>

{#if show}
  <div
    class="sync-dropdown-wrapper"
    use:clickOutside={closeSyncDropdown}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
  >
    <button
      class="sync-status"
      title={state === "syncing" ? "Syncing..." : "Sync status"}
      aria-haspopup="true"
      aria-expanded={syncDropdownOpen.value}
      disabled={syncing.value}
    >
      <span class="sync-status-cloud">&#9729;</span>
      {#if state === "syncing"}
        <span class="sync-status-indicator sync-status-spinning">&#8635;</span>
      {:else if state === "pending"}
        <span class="sync-status-indicator sync-status-pending">&#9670;</span>
      {:else if state === "synced"}
        <span class="sync-status-indicator sync-status-ok">&#10003;</span>
        <span class="sync-status-indicator sync-status-hover">&#8635;</span>
      {/if}
    </button>

    {#if syncDropdownOpen.value}
      <div
        class="sync-dropdown"
        role="menu"
        onclick={(e) => e.stopPropagation()}
      >
        {#if syncing.value}
          <div class="sync-dropdown-syncing">
            <span class="sync-dropdown-syncing-icon">&#8635;</span>
            <span>Syncing...</span>
          </div>
        {:else if syncResult.value}
          <div class="sync-dropdown-result">
            <span class="sync-dropdown-result-icon">&#10003;</span>
            <span>
              {#if syncResult.value.uploaded || syncResult.value.downloaded}
                {syncResult.value.uploaded
                  ? "↑" + syncResult.value.uploaded
                  : ""}
                {syncResult.value.downloaded
                  ? " ↓" + syncResult.value.downloaded
                  : ""}
                synced
              {:else}
                In sync
              {/if}
            </span>
          </div>
        {:else if needsPassword}
          <div class="sync-dropdown-form">
            {#if lastSyncedAgo}
              <div class="sync-dropdown-info">
                <span class="sync-paused">Paused</span> (synced {lastSyncedAgo})
              </div>
            {/if}
            <div class="sync-dropdown-input-row">
              <input
                type="password"
                class="sync-dropdown-input"
                placeholder="Password"
                bind:value={syncDropdownPassword.value}
                onkeydown={handleKeyPress}
              />
              <button
                class="sync-dropdown-btn-icon"
                onclick={() => doSyncFromDropdown()}
                disabled={!syncDropdownPassword.value}
                title="Sync now"
              >
                &#8635;
              </button>
            </div>
            <label class="sync-dropdown-remember">
              <input
                type="checkbox"
                bind:checked={syncDropdownRemember.value}
              />
              <span class="sync-dropdown-remember-text">Remember password</span>
            </label>
            {#if syncError.value}
              <div class="sync-dropdown-error">{syncError.value}</div>
            {/if}
          </div>
        {:else}
          <div class="sync-dropdown-status">
            <span class="sync-dropdown-info">Synced {lastSyncedAgo}</span>
            {#if lastSyncedAgo !== "just now"}
              <button
                class="sync-dropdown-btn-icon"
                onclick={() => doSyncFromDropdown()}
                title="Sync now"
              >
                &#8635;
              </button>
            {/if}
          </div>
          <button class="sync-dropdown-forget" onclick={() => forgetPassword()}>
            {getHasRememberedPassword()
              ? "forget stored password"
              : "forget password"}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sync-dropdown-wrapper {
    position: relative;
    display: inline-flex;
  }

  .sync-status {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: none;
  }

  .sync-status-cloud {
    font-size: 1.4rem;
    color: var(--text-hint);
    line-height: 1;
  }

  .sync-status-indicator {
    position: absolute;
    font-size: 0.5rem;
    font-weight: 700;
    top: 50%;
    right: -0.3rem;
    transform: translateY(-50%);
    line-height: 1;
  }

  .sync-status-ok {
    color: var(--accent);
  }

  .sync-status-pending {
    color: var(--warning);
  }

  .sync-status-spinning {
    color: var(--accent);
    font-size: 0.6rem;
    animation: sync-spin 1s linear infinite;
  }

  @keyframes sync-spin {
    from {
      transform: translateY(-50%) rotate(0deg);
    }
    to {
      transform: translateY(-50%) rotate(360deg);
    }
  }

  .sync-status-hover {
    display: none;
    color: var(--accent);
  }

  .sync-dropdown-wrapper:hover .sync-status-hover,
  .sync-dropdown-wrapper:focus-within .sync-status-hover {
    display: block;
  }

  .sync-dropdown-wrapper:hover .sync-status-ok,
  .sync-dropdown-wrapper:focus-within .sync-status-ok {
    display: none;
  }

  .sync-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.75rem;
    min-width: min(250px, calc(100vw - 2rem));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }

  .sync-dropdown::before {
    content: "";
    position: absolute;
    top: -0.5rem;
    left: 0;
    right: 0;
    height: 0.5rem;
  }

  .sync-dropdown-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sync-dropdown-input-row {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .sync-dropdown-input-row .sync-dropdown-input {
    flex: 1;
    min-width: 0;
  }

  .sync-dropdown-input {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    padding: 0.5rem 0.625rem;
    color: var(--text-primary);
    font-size: 0.85rem;
    width: 100%;
  }

  .sync-dropdown-input:focus {
    outline: none;
    border-color: var(--accent-border);
  }

  .sync-dropdown-input::placeholder {
    color: var(--text-disabled);
  }

  .sync-dropdown-btn {
    background: var(--accent);
    color: var(--bg-base);
    border: none;
    border-radius: var(--radius);
    padding: 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .sync-dropdown-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .sync-dropdown-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sync-dropdown-error {
    color: var(--danger);
    font-size: 0.8rem;
  }

  .sync-dropdown-result {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--accent);
    font-size: 0.85rem;
  }

  .sync-dropdown-result-icon {
    font-size: 1rem;
  }

  .sync-dropdown-syncing {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-subtle);
    font-size: 0.85rem;
  }

  .sync-dropdown-syncing-icon {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .sync-dropdown-info {
    color: var(--text-subtle);
    font-size: 0.8rem;
  }

  .sync-paused {
    color: var(--warning);
  }

  .sync-dropdown-form .sync-dropdown-info {
    margin-bottom: 0.25rem;
  }

  .sync-dropdown-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .sync-dropdown-status .sync-dropdown-info {
    flex: 1;
  }

  .sync-dropdown-btn-icon {
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    color: var(--text-subtle);
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.15s;
  }

  .sync-dropdown-btn-icon:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .sync-dropdown-forget {
    font-size: 0.65rem;
    font-weight: 500;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
    color: var(--text-disabled);
    background: transparent;
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    margin-top: 0.25rem;
  }

  .sync-dropdown-forget:hover {
    color: var(--text-subtle);
    border-color: var(--border-mid);
  }

  .sync-dropdown-remember {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    margin-top: 0.25rem;
  }

  .sync-dropdown-remember input[type="checkbox"] {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .sync-dropdown-remember-text {
    font-size: 0.75rem;
    color: var(--text-subtle);
  }
</style>

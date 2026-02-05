<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    clickable?: boolean;
    active?: boolean;
    variant?: "default" | "action" | "subtle";
    onclick?: (e: MouseEvent) => void;
    header?: Snippet;
    children?: Snippet;
    details?: Snippet;
    actions?: Snippet;
  }

  let {
    clickable = false,
    active = false,
    variant = "default",
    onclick,
    header,
    children,
    details,
    actions,
  }: Props = $props();
</script>

<div
  class="card"
  class:card-clickable={clickable}
  class:card-active={active}
  class:card-action={variant === "action"}
  class:card-subtle={variant === "subtle"}
  role={clickable ? "button" : undefined}
  tabIndex={clickable ? 0 : undefined}
  {onclick}
  onkeydown={(e) =>
    clickable && (e.key === "Enter" || e.key === " ") && onclick?.(e as any)}
>
  {#if header}
    <div class="card-header">
      {@render header()}
    </div>
  {/if}

  {#if children}
    <div class="card-content">
      {@render children()}
    </div>
  {/if}

  {#if details}
    <div class="card-details">
      {@render details()}
    </div>
  {/if}

  {#if actions}
    <div class="card-actions">
      {@render actions()}
    </div>
  {/if}
</div>

<style>
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    transition: all 0.15s ease;
  }

  .card-clickable {
    cursor: pointer;
  }

  .card-clickable:hover {
    border-color: var(--border-mid);
    background: var(--bg-card-hover);
  }

  .card-active {
    border-color: var(--accent-border);
    background: var(--accent-bg);
  }

  .card-action {
    background: var(--bg-chip);
    border-style: dashed;
    text-align: center;
  }

  .card-action:hover {
    border-color: var(--accent);
    background: var(--accent-bg);
  }

  .card-subtle {
    background: transparent;
    border-color: transparent;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .card-content {
    padding: 1rem 1.25rem;
  }

  .card-details {
    padding: 1.25rem 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card-actions {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>

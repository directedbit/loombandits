<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  let { running = false }: { running?: boolean } = $props();

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Look for a new version once an hour while the app is open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
    onOfflineReady() {
      // Informational only: never leave it covering the controls.
      setTimeout(() => offlineReady.set(false), 4000);
    },
  });
</script>

{#if $needRefresh && !running}
  <div class="banner" role="status">
    <span>Update available</span>
    <button class="primary" onclick={() => updateServiceWorker(true)}>Reload</button>
    <button onclick={() => needRefresh.set(false)}>Later</button>
  </div>
{:else if $offlineReady}
  <div class="banner" role="status">
    <span>Ready to work offline</span>
    <button onclick={() => offlineReady.set(false)}>OK</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
    z-index: 20;
  }
  .banner span {
    flex: 1;
    font-weight: 600;
  }
</style>

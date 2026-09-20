<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from './store/game.svelte';
  import GameScreen from './ui/GameScreen.svelte';
  import SettingsScreen from './ui/SettingsScreen.svelte';
  import SummaryScreen from './ui/SummaryScreen.svelte';
  import UpdateBanner from './ui/UpdateBanner.svelte';

  type Route = 'game' | 'settings' | 'summary';

  function parseRoute(): Route {
    const h = location.hash.replace(/^#\/?/, '');
    return h === 'settings' || h === 'summary' ? h : 'game';
  }

  let route = $state<Route>(parseRoute());
  let now = $state(Date.now());

  onMount(() => {
    const onHash = () => (route = parseRoute());
    window.addEventListener('hashchange', onHash);
    const tick = setInterval(() => (now = Date.now()), 250);
    return () => {
      window.removeEventListener('hashchange', onHash);
      clearInterval(tick);
    };
  });
</script>

<nav class="topnav" aria-label="Screens">
  <a href="#/game" class:active={route === 'game'}>Game</a>
  <a href="#/summary" class:active={route === 'summary'}>Summary</a>
  <a href="#/settings" class:active={route === 'settings'}>Settings</a>
</nav>

{#if route === 'settings'}
  <SettingsScreen />
{:else if route === 'summary'}
  <SummaryScreen {now} />
{:else}
  <GameScreen {now} />
{/if}

<UpdateBanner running={game.state?.phase === 'running'} />

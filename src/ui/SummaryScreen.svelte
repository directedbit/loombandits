<script lang="ts">
  import { formatClock, summary, summaryText, targetPlayedMs } from '../engine';
  import { game } from '../store/game.svelte';

  let { now }: { now: number } = $props();

  const gameState = $derived(game.state);
  const rows = $derived(gameState ? summary(gameState, now) : []);
  let copied = $state(false);

  async function copy() {
    if (!gameState) return;
    const text = summaryText(gameState, now);
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      prompt('Copy this text', text);
    }
  }
  function newGame() {
    if (confirm('Start a new game? This summary will be cleared.')) {
      game.discard();
      location.hash = '#/game';
    }
  }
  const where = (loc: string) =>
    loc === 'out' ? 'not playing' : loc === 'field' ? 'on field' : 'sideline';
</script>

<div class="screen">
  {#if !gameState}
    <h1>Summary</h1>
    <p class="muted">No game yet.</p>
  {:else}
    <h1>{gameState.config.teamName}</h1>
    <p class="muted">
      {gameState.phase === 'finished' ? 'Full time' : 'Game in progress'} · fair share
      {formatClock(targetPlayedMs(gameState))} each
    </p>
    <table>
      <thead>
        <tr><th>Player</th><th>Played</th><th>Stints</th><th></th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr class:out={r.location === 'out'}>
            <td>{r.name}</td>
            <td class="mono">{formatClock(r.playedMs)}</td>
            <td>{r.stints}</td>
            <td class="muted">{where(r.location)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="buttons">
      <button class="primary" onclick={copy}>{copied ? 'Copied' : 'Copy as text'}</button>
      {#if gameState.phase === 'finished'}
        <button onclick={newGame}>New game</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 10px 6px;
    border-bottom: 1px solid var(--line);
  }
  th {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  tr.out td {
    opacity: 0.6;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
</style>

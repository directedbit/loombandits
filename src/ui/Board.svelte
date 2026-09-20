<script lang="ts">
  import {
    nextOffQueue,
    nextOnQueue,
    playersAt,
    totalPlayedMs,
    type GameState,
    type Location,
    type PlayerId,
    type Swap,
  } from '../engine';
  import PlayerCard from './PlayerCard.svelte';

  interface Props {
    gameState: GameState;
    now: number;
    swap: Swap;
    onMove: (id: PlayerId, to: Location) => void;
  }

  let { gameState, now, swap, onMove }: Props = $props();

  const names = $derived(new Map(gameState.players.map((p) => [p.id, p.name])));
  const name = (id: PlayerId) => names.get(id) ?? id;

  const field = $derived(nextOffQueue(gameState, now));
  const bench = $derived(nextOnQueue(gameState, now));
  const out = $derived(playersAt(gameState, 'out').sort((a, b) => name(a).localeCompare(name(b))));

  let showOut = $state(true);
  let selected = $state<PlayerId | null>(null);

  function toggle(id: PlayerId) {
    selected = selected === id ? null : id;
  }
  function move(id: PlayerId, to: Location) {
    selected = null;
    onMove(id, to);
  }

  const fieldMoves: Array<[Location, string]> = [
    ['bench', '→ Sideline'],
    ['out', '✕ Not playing'],
  ];
  const benchMoves: Array<[Location, string]> = [
    ['field', '→ On field'],
    ['out', '✕ Not playing'],
  ];
  const outMoves: Array<[Location, string]> = [
    ['bench', '→ Sideline'],
    ['field', '→ On field'],
  ];
</script>

<section class="board">
  <div class="col bench">
    <h2>Sideline <span class="count">{bench.length}</span></h2>
    {#each bench as id, i (id)}
      <PlayerCard
        name={name(id)}
        playedMs={totalPlayedMs(gameState, id, now)}
        badge={swap.on.includes(id) ? 'on' : null}
        rank={i + 1}
        expanded={selected === id}
        moves={benchMoves}
        onToggle={() => toggle(id)}
        onMove={(to) => move(id, to)}
      />
    {/each}
    {#if bench.length === 0}
      <p class="empty muted">Nobody on the sideline</p>
    {/if}
  </div>
  <div class="col field">
    <h2>On field <span class="count">{field.length}/{gameState.config.onField}</span></h2>
    {#each field as id, i (id)}
      <PlayerCard
        name={name(id)}
        playedMs={totalPlayedMs(gameState, id, now)}
        badge={swap.off.includes(id) ? 'off' : null}
        rank={i + 1}
        expanded={selected === id}
        moves={fieldMoves}
        onToggle={() => toggle(id)}
        onMove={(to) => move(id, to)}
      />
    {/each}
    {#if field.length === 0}
      <p class="empty muted">Nobody on the field</p>
    {/if}
  </div>
</section>

<section class="outbox">
  <button class="ghost toggle" onclick={() => (showOut = !showOut)} aria-expanded={showOut}>
    <span class="chev">{showOut ? '⌄' : '›'}</span>
    Not playing <span class="count">{out.length}</span>
  </button>
  {#if showOut}
    <div class="strip">
      {#each out as id (id)}
        <PlayerCard
          name={name(id)}
          playedMs={totalPlayedMs(gameState, id, now)}
          expanded={selected === id}
          moves={outMoves}
          onToggle={() => toggle(id)}
          onMove={(to) => move(id, to)}
        />
      {/each}
      {#if out.length === 0}
        <p class="empty muted">Everyone is available</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .board {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 14px;
    min-height: 140px;
  }
  .bench {
    background: var(--bench-bg);
  }
  .field {
    background: var(--field-bg);
  }
  h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: flex;
    justify-content: space-between;
    padding: 2px 4px;
  }
  .count {
    color: var(--muted);
    font-weight: 600;
  }
  .empty {
    text-align: center;
    padding: 16px 4px;
    font-size: 0.95rem;
  }
  .outbox {
    background: var(--out-bg);
    border-radius: 14px;
    padding: 4px 8px 8px;
  }
  .toggle {
    width: 100%;
    display: flex;
    gap: 8px;
    align-items: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 1rem;
    font-weight: 700;
    padding: 0 4px;
  }
  .toggle .count {
    margin-left: auto;
  }
  .chev {
    font-size: 1.3rem;
    line-height: 1;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
</style>

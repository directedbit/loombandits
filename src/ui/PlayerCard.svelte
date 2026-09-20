<script lang="ts">
  import { formatClock, type Location } from '../engine';

  interface Props {
    name: string;
    playedMs: number;
    badge?: 'on' | 'off' | null;
    rank?: number | null;
    expanded?: boolean;
    moves: Array<[Location, string]>;
    onToggle: () => void;
    onMove: (to: Location) => void;
  }

  let {
    name,
    playedMs,
    badge = null,
    rank = null,
    expanded = false,
    moves,
    onToggle,
    onMove,
  }: Props = $props();
</script>

<div class="card" class:on={badge === 'on'} class:off={badge === 'off'} class:expanded>
  <button class="face" onclick={onToggle} aria-expanded={expanded}>
    <span class="top">
      {#if rank !== null}
        <span class="rank">{rank}</span>
      {/if}
      <span class="name">{name}</span>
    </span>
    <span class="time mono">{formatClock(playedMs)}</span>
  </button>
  {#if badge}
    <span class="badge">{badge === 'on' ? 'NEXT ON' : 'NEXT OFF'}</span>
  {/if}
  {#if expanded}
    <div class="moves">
      {#each moves as [to, label] (to)}
        <button onclick={() => onMove(to)}>{label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    overflow: hidden;
  }
  .card.on {
    box-shadow: inset 6px 0 0 var(--on);
  }
  .card.off {
    box-shadow: inset 6px 0 0 var(--off);
  }
  .face {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    width: 100%;
    min-height: 60px;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 8px 10px 6px;
    text-align: left;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-right: 4px;
  }
  /* Keep the name clear of the NEXT ON / NEXT OFF badge in the corner. */
  .card.on .top,
  .card.off .top {
    padding-right: 64px;
  }
  .rank {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--line);
    font-size: 0.75rem;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .time {
    align-self: flex-end;
    font-size: 0.95rem;
    color: var(--muted);
    font-weight: 600;
  }
  .badge {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-bottom-left-radius: 8px;
    background: var(--fg);
    color: var(--bg);
  }
  .card.on .badge {
    background: var(--on);
    color: #063;
  }
  .card.off .badge {
    background: var(--off);
    color: #532;
  }
  .moves {
    display: flex;
    gap: 8px;
    padding: 0 8px 8px;
  }
  .moves button {
    flex: 1;
    min-height: 44px;
    font-size: 0.95rem;
    padding: 0 8px;
  }
</style>

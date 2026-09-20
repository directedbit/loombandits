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
    {#if rank !== null}
      <span class="rank">{rank}</span>
    {/if}
    <span class="name">{name}</span>
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
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 60px;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 8px 12px;
    text-align: left;
  }
  .rank {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--line);
    font-size: 0.8rem;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 1.15rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    flex: none;
    font-size: 1rem;
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

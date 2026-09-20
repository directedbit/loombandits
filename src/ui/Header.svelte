<script lang="ts">
  import { formatClock, periodRemainingMs, subCountdownMs, type GameState } from '../engine';

  let { gameState, now }: { gameState: GameState; now: number } = $props();

  const remaining = $derived(periodRemainingMs(gameState, now));
  const countdown = $derived(subCountdownMs(gameState, now));
  const live = $derived(gameState.phase === 'running' || gameState.phase === 'paused');
  const due = $derived(countdown !== null && countdown <= 0);
  const periodLabel = $derived.by(() => {
    switch (gameState.phase) {
      case 'pre':
        return 'Kick-off';
      case 'break':
        return `Break after period ${gameState.period}`;
      case 'finished':
        return 'Full time';
      case 'paused':
        return `Period ${gameState.period} of ${gameState.config.periods} · paused`;
      default:
        return `Period ${gameState.period} of ${gameState.config.periods}`;
    }
  });
  const clockText = $derived(
    gameState.phase === 'finished'
      ? '0:00'
      : live
        ? formatClock(remaining)
        : formatClock(gameState.config.periodMinutes * 60_000),
  );
</script>

<header class="hdr">
  <div class="team">{gameState.config.teamName}</div>
  <div class="row">
    <div class="block">
      <div class="label">{periodLabel}</div>
      <div class="big mono" class:over={live && remaining < 0}>{clockText}</div>
    </div>
    <div class="block right">
      <div class="label">Next sub</div>
      <div class="big mono" class:due>
        {#if countdown === null}
          —
        {:else if due}
          NOW
        {:else}
          {formatClock(countdown)}
        {/if}
      </div>
      {#if due && countdown !== null && countdown < -1000}
        <div class="label late">{formatClock(countdown)} late</div>
      {/if}
    </div>
  </div>
</header>

<style>
  .hdr {
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 10px 14px;
    background: var(--card);
  }
  .team {
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .block {
    min-width: 0;
  }
  .right {
    text-align: right;
  }
  .label {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .big {
    font-size: 2.6rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .over {
    color: var(--due);
  }
  .due {
    color: var(--due);
    animation: pulse 1s infinite;
  }
  .late {
    color: var(--due);
    font-weight: 600;
  }
  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
</style>

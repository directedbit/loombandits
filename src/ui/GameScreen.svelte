<script lang="ts">
  import {
    formatClock,
    periodLengthMs,
    promotedLineup,
    recommendedSwap,
    reorderedLineup,
    subCountdownMs,
    type GameEvent,
    type Location,
    type PlayerId,
  } from '../engine';
  import { game } from '../store/game.svelte';
  import { settings } from '../store/settings.svelte';
  import Header from './Header.svelte';
  import Board from './Board.svelte';

  let { now }: { now: number } = $props();

  const gameState = $derived(game.state);
  const swap = $derived(gameState ? recommendedSwap(gameState) : { off: [], on: [] });
  const countdown = $derived(gameState ? subCountdownMs(gameState, now) : null);
  const due = $derived(countdown !== null && countdown <= 0);
  const names = $derived(new Map(gameState?.players.map((p) => [p.id, p.name]) ?? []));
  const label = (ids: PlayerId[]) => ids.map((id) => names.get(id) ?? id).join(', ');
  const canSub = $derived(swap.off.length + swap.on.length > 0);

  const at = () => Date.now();
  function dispatch(event: GameEvent) {
    game.dispatch(event);
  }
  function undo() {
    game.undo();
  }
  // The order on the board is the order: these change it for good (until changed again).
  function reorder(id: PlayerId, direction: -1 | 1) {
    if (!gameState) return;
    const order = reorderedLineup(gameState, id, direction);
    if (order) dispatch({ type: 'LineupOrdered', at: at(), order });
  }
  function promote(id: PlayerId) {
    if (!gameState) return;
    const order = promotedLineup(gameState, id);
    if (order) dispatch({ type: 'LineupOrdered', at: at(), order });
  }

  function newGame() {
    const s = settings.value;
    const location: Record<PlayerId, Location> = {};
    s.players.forEach((p, i) => {
      location[p.id] = i < s.onField ? 'field' : 'bench';
    });
    dispatch({
      type: 'GameCreated',
      at: at(),
      config: {
        teamName: s.teamName,
        periods: s.periods,
        periodMinutes: s.periodMinutes,
        onField: s.onField,
        swapSize: s.swapSize,
        intervalSeconds: s.intervalSeconds,
        rotationScope: s.rotationScope,
      },
      players: s.players,
      location,
    });
  }
  function doSub() {
    if (canSub) dispatch({ type: 'SubMade', at: at(), off: swap.off, on: swap.on });
  }
  function move(id: PlayerId, to: Location) {
    dispatch({ type: 'PlayerMoved', at: at(), id, to });
  }
  function startPeriod() {
    dispatch({ type: 'PeriodStarted', at: at() });
  }
  function endPeriod() {
    if (!gameState) return;
    if (confirm(`End period ${gameState.period}?`)) dispatch({ type: 'PeriodEnded', at: at() });
  }
  /**
   * The half is being cut short (or extended): change its length. Minutes already played
   * stay as they are; the subs still to come are re-spread over the new time left.
   */
  function adjustPeriod(deltaMs: number) {
    dispatch({ type: 'PeriodAdjusted', at: at(), deltaMs });
  }
  function discard() {
    if (confirm('Discard this game? Playing times will be lost.')) game.discard();
  }

  // Buzz once each time a sub becomes due.
  let buzzedFor: number | null = null;
  $effect(() => {
    if (!gameState || gameState.phase !== 'running') return;
    if (due && buzzedFor !== gameState.subAnchorGameMs) {
      buzzedFor = gameState.subAnchorGameMs;
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    }
  });

  // Keep the screen awake while the clock runs.
  $effect(() => {
    if (gameState?.phase !== 'running' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (released) void s.release();
          else sentinel = s;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release();
    };
  });
</script>

<div class="screen" class:fixed={gameState !== null}>
  {#if !gameState}
    {@const s = settings.value}
    <div class="start">
      <h1>{s.teamName}</h1>
      <p class="muted">
        {s.players.length} players · {s.onField} on field · {s.periods} × {s.periodMinutes} min ·
        {s.swapSize} per sub
      </p>
      <button class="primary big" onclick={newGame} disabled={s.players.length === 0}>
        New game
      </button>
      <a href="#/settings">Change team or game settings</a>
    </div>
  {:else}
    <Header {gameState} {now} />

    <div class="scroll">
      {#if gameState.phase === 'pre'}
        <p class="hint muted">
          Tap a player to move her, or set her place in the order: 1 comes off (or goes on) first.
          The order carries on through the game and you can change it at any time. Mark anyone
          absent as not playing, then start.
        </p>
      {/if}

      <Board {gameState} {now} {swap} onMove={move} onReorder={reorder} onPromote={promote} />
    </div>

    <div class="controls">
      {#if gameState.phase !== 'pre' && gameState.phase !== 'finished'}
        <div class="subline" class:due>
          {#if !canSub}
            <span class="muted">No substitution possible</span>
          {:else}
            <div class="who">
              {#if swap.off.length}<div><strong>OFF</strong> {label(swap.off)}</div>{/if}
              {#if swap.on.length}<div><strong>ON</strong> {label(swap.on)}</div>{/if}
            </div>
            <button class="primary" onclick={doSub}>
              {due ? 'Sub now' : 'Sub early'}
            </button>
          {/if}
        </div>
      {/if}

      <div class="buttons">
        {#if gameState.phase === 'pre'}
          <button class="primary big" onclick={startPeriod}>Start period 1</button>
          <button class="danger" onclick={discard}>Discard</button>
        {:else if gameState.phase === 'running'}
          <button onclick={() => dispatch({ type: 'Paused', at: at() })}>Pause</button>
          <button class="danger" onclick={endPeriod}>End period</button>
        {:else if gameState.phase === 'paused'}
          <button class="primary" onclick={() => dispatch({ type: 'Resumed', at: at() })}>
            Resume
          </button>
          <button class="danger" onclick={endPeriod}>End period</button>
        {:else if gameState.phase === 'break'}
          <button class="primary big" onclick={startPeriod}
            >Start period {gameState.period + 1}</button
          >
        {:else}
          <button class="primary big" onclick={() => (location.hash = '#/summary')}>Summary</button>
          <button onclick={discard}>New game</button>
        {/if}
        <button class="ghost" onclick={undo} disabled={!game.canUndo}>Undo</button>
      </div>

      {#if gameState.phase !== 'finished'}
        <div class="buttons clock">
          <span class="muted small">
            {gameState.phase === 'break' ? 'Next period' : 'Period'}
            <span class="mono">{formatClock(periodLengthMs(gameState))}</span>
          </span>
          <button onclick={() => adjustPeriod(-30_000)} aria-label="Take 30 seconds off the period">
            −30s
          </button>
          <button onclick={() => adjustPeriod(30_000)} aria-label="Add 30 seconds to the period">
            +30s
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .start {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
    padding: 24px 0;
  }
  .start a {
    color: var(--fg);
  }
  .big {
    min-height: 60px;
    font-size: 1.2rem;
    padding: 0 28px;
  }
  .hint {
    margin: 0;
    font-size: 0.95rem;
  }
  .controls {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .subline {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 2px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }
  .subline.due {
    border-color: var(--due);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--due) 30%, transparent);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .who strong {
    display: inline-block;
    width: 3ch;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .buttons > button {
    flex: 1 1 auto;
  }
  .clock {
    align-items: center;
  }
  .clock .small {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
</style>

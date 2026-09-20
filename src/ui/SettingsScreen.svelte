<script lang="ts">
  import { formatClock, resolveIntervalMs } from '../engine';
  import { game } from '../store/game.svelte';
  import { settings } from '../store/settings.svelte';

  const s = $derived(settings.value);
  let newName = $state('');

  function num(e: Event, min: number, max: number): number {
    const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
    return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  }
  function add() {
    settings.addPlayer(newName);
    newName = '';
  }

  const autoIntervalMs = $derived(
    resolveIntervalMs({ ...s, intervalSeconds: null }, s.players.length),
  );
  const inGame = $derived(game.state !== null && game.state.phase !== 'finished');

  function applyToGame() {
    if (!game.state) return;
    game.dispatch({
      type: 'ConfigChanged',
      at: Date.now(),
      config: {
        teamName: s.teamName,
        periods: s.periods,
        periodMinutes: s.periodMinutes,
        onField: s.onField,
        swapSize: s.swapSize,
        intervalSeconds: s.intervalSeconds,
      },
    });
    location.hash = '#/game';
  }
</script>

<div class="screen">
  <h1>Settings</h1>

  <label class="row">
    <span>Team name</span>
    <input
      value={s.teamName}
      oninput={(e) => settings.update({ teamName: e.currentTarget.value })}
    />
  </label>

  <fieldset>
    <legend>Game</legend>
    <div class="grid">
      <label>
        <span>Periods</span>
        <input
          type="number"
          inputmode="numeric"
          min="1"
          max="8"
          value={s.periods}
          onchange={(e) => settings.update({ periods: num(e, 1, 8) })}
        />
      </label>
      <label>
        <span>Minutes per period</span>
        <input
          type="number"
          inputmode="numeric"
          min="1"
          max="90"
          value={s.periodMinutes}
          onchange={(e) => settings.update({ periodMinutes: num(e, 1, 90) })}
        />
      </label>
      <label>
        <span>Players on field</span>
        <input
          type="number"
          inputmode="numeric"
          min="1"
          max="15"
          value={s.onField}
          onchange={(e) => settings.update({ onField: num(e, 1, 15) })}
        />
      </label>
      <label>
        <span>Swapped per sub</span>
        <input
          type="number"
          inputmode="numeric"
          min="1"
          max="11"
          value={s.swapSize}
          onchange={(e) => settings.update({ swapSize: num(e, 1, 11) })}
        />
      </label>
    </div>
    <label class="row">
      <span>Sub interval</span>
      <select
        value={s.intervalSeconds === null ? 'auto' : 'fixed'}
        onchange={(e) =>
          settings.update({
            intervalSeconds:
              e.currentTarget.value === 'auto' ? null : Math.round(autoIntervalMs / 1000),
          })}
      >
        <option value="auto">Auto ({formatClock(autoIntervalMs)})</option>
        <option value="fixed">Fixed</option>
      </select>
    </label>
    {#if s.intervalSeconds !== null}
      <label class="row">
        <span>Every (minutes)</span>
        <input
          type="number"
          inputmode="decimal"
          min="0.5"
          max="45"
          step="0.5"
          value={s.intervalSeconds / 60}
          onchange={(e) =>
            settings.update({
              intervalSeconds: Math.round(
                Math.min(45, Math.max(0.5, Number(e.currentTarget.value) || 0.5)) * 60,
              ),
            })}
        />
      </label>
    {/if}
    <p class="muted small">
      Auto splits each period into equal chunks of at most 6 minutes, with enough subs for everyone
      to rotate. Who comes off and on is always worked out from minutes played.
    </p>
  </fieldset>

  <fieldset>
    <legend>Players ({s.players.length})</legend>
    <ul class="players">
      {#each s.players as p (p.id)}
        <li>
          <input
            value={p.name}
            aria-label="Player name"
            onchange={(e) => settings.renamePlayer(p.id, e.currentTarget.value)}
          />
          <button
            class="danger"
            aria-label={`Remove ${p.name}`}
            onclick={() => settings.removePlayer(p.id)}
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
    <form
      class="add"
      onsubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input bind:value={newName} placeholder="Add a player" autocomplete="off" />
      <button type="submit" class="primary" disabled={!newName.trim()}>Add</button>
    </form>
  </fieldset>

  {#if inGame}
    <div class="note">
      <p>
        A game is in progress. Player changes apply to the next game. Game settings can be applied
        to the current game now.
      </p>
      <button onclick={applyToGame}>Apply game settings to current game</button>
    </div>
  {/if}

  <p class="muted small">Everything is stored on this phone only. Nothing is sent anywhere.</p>
</div>

<style>
  fieldset {
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }
  legend {
    font-weight: 700;
    padding: 0 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .row {
    flex-direction: column;
  }
  select {
    font: inherit;
    min-height: 48px;
    border-radius: 10px;
    border: 2px solid var(--line);
    background: var(--card);
    color: var(--fg);
    padding: 0 12px;
  }
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .players li,
  .add {
    display: flex;
    gap: 8px;
  }
  .players li input,
  .add input {
    flex: 1;
  }
  .players li button {
    flex: none;
    min-width: 48px;
    padding: 0;
  }
  .note {
    border: 2px dashed var(--line);
    border-radius: 14px;
    padding: 10px 12px;
  }
  .note p {
    margin: 0 0 10px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>

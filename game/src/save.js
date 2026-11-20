// The save slot: one JSON blob in localStorage. It holds the money, the story
// progress and where the player stood, so a visit picks up where the last one
// ended. Nothing secret lives here — it is the player's own progress.

import { BEST_KEY, SAVE_KEY } from './config.js';

/** Read the save slot, or null when there is none or it is corrupt. */
export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

/** Write the save slot from the world's state. */
export function writeSave(state) {
  try {
    const save = {
      money: state.money,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      timeOfDay: state.timeOfDay,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): the run then lasts this visit only.
  }
}

/** The best run so far (most money, then most jobs), for the title screen. */
export function readBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return { money: 0, missions: 0 };
    const best = JSON.parse(raw);
    return { money: best.money || 0, missions: best.missions || 0 };
  } catch {
    return { money: 0, missions: 0 };
  }
}

/** Record a run's end if it beats the stored best. */
export function writeBest(state) {
  try {
    const best = readBest();
    if (state.money > best.money || state.missionsDone > best.missions) {
      window.localStorage.setItem(BEST_KEY, JSON.stringify({ money: state.money, missions: state.missionsDone }));
    }
  } catch {
    // Storage can be off: nothing to do.
  }
}

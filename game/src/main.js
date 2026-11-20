// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between screens: title,
// intro card, play, missions list, paused, and wasted/busted. The world is
// saved to localStorage every few seconds and whenever a mission completes.
//
// ?seed=N fixes the city. ?shot=cover|chase|city|night (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_KILL, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MISSION, ACTION_PAUSE, ACTION_RELOAD, createInput } from './input.js';
import { createRenderer, SCREEN_MISSIONS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { readBest, readSave, writeBest, writeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const SAVE_EVERY = 5;
const TOAST_LIFE = 4;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const saved = readSave();
if (saved && !shot) world.applySave(saved);

function runShot(name) {
  stageShot(name, world);
  const ui = {
    screen: SCREEN_PLAY,
    marker: world.missionMarker(),
    stepText: world.currentStepText(),
    toasts: [],
    best: readBest(),
    overReason: null,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, ui, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = SAVE_EVERY;
  let overReason = null;
  let sawIntro = false;
  let outroShown = false;
  const toasts = [];

  function announce(message) {
    status.textContent = message;
  }

  function toast(text) {
    toasts.push({ text, life: TOAST_LIFE });
    if (toasts.length > 4) toasts.shift();
  }

  function startGame() {
    world.reset();
    const fresh = readSave();
    if (fresh && !sawIntro) {
      world.applySave(fresh);
    }
    accumulator = 0;
    if (!sawIntro) {
      screen = 'intro';
      sawIntro = true;
      announce('Neon Harbor. Press Space to begin.');
    } else {
      screen = SCREEN_PLAY;
      announce('Playing. Follow the mission objective.');
    }
    audio.unlock();
  }

  function handleEvents(result) {
    const { events, messages } = result;
    for (const message of messages) toast(message);
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_KILL) audio.shot();
    if (events & EVENT_MISSION_DONE) {
      audio.missionDone();
      writeSave(world.state);
      writeBest(world.state);
      best = readBest();
    }
    if (events & EVENT_MISSION_FAIL) audio.busted();
    if (events & EVENT_WASTED) {
      overReason = 'wasted';
      screen = SCREEN_OVER;
      audio.busted();
      writeSave(world.state);
      announce('Wasted. Press Space to get back on your feet.');
    }
    if (events & EVENT_BUSTED) {
      overReason = 'busted';
      screen = SCREEN_OVER;
      audio.busted();
      writeSave(world.state);
      announce('Busted. Press Space to get back on your feet.');
    }
  }

  function controlsForFrame() {
    const axes = input.axes();
    const mouse = input.mouse();
    // Mouse position is in CSS pixels; the view is 1280x720 scaled to the canvas.
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const worldMouseX = world.state.camera.x + (mouse.x * scaleX - 640);
    const worldMouseY = world.state.camera.y + (mouse.y * scaleY - 360);
    const actions = input.takeActions();
    return {
      moveX: axes.x,
      moveY: axes.y,
      run: input.running(),
      steer: axes.x,
      gas: axes.y < 0,
      brake: axes.y > 0,
      aimX: worldMouseX,
      aimY: worldMouseY,
      firing: input.firing(),
      enter: Boolean(actions & ACTION_ENTER),
      reload: Boolean(actions & ACTION_RELOAD),
      startMission: -1,
      actions,
    };
  }

  function handleActions(c) {
    const actions = c.actions;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.click();
        startGame();
      }
      return;
    }
    if (screen === 'intro') {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        audio.click();
        announce('Playing. Follow the mission objective.');
      }
      return;
    }
    if (screen === 'outro') {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        audio.click();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        world.respawn();
        screen = SCREEN_PLAY;
        audio.click();
        announce('Back on your feet. The city is waiting.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        audio.click();
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        audio.click();
        announce('Playing.');
      } else if (screen === SCREEN_MISSIONS) {
        screen = SCREEN_PLAY;
        audio.click();
      }
      return;
    }
    if (actions & ACTION_MISSION) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_MISSIONS;
        audio.click();
      } else if (screen === SCREEN_MISSIONS) {
        screen = SCREEN_PLAY;
        audio.click();
      }
    }
  }

  function step() {
    const c = controlsForFrame();
    handleActions(c);
    if (screen !== SCREEN_PLAY) return;
    const result = world.step(STEP, c);
    handleEvents(result);
    if (world.state.mission === null && !outroShown && world.state.missionsDone >= 5) {
      outroShown = true;
      screen = 'outro';
    }
    // Engine, siren and music follow the state every frame.
    const p = world.state.player;
    audio.setSiren(p.wanted > 0);
    audio.updateSiren(STEP);
    audio.updateMusic(STEP, true);
    if (p.car) {
      audio.startEngine();
      audio.setEngine(Math.abs(p.car.speed) / 560, true);
    } else {
      audio.setEngine(0, false);
    }
    saveTimer -= STEP;
    if (saveTimer <= 0) {
      saveTimer = SAVE_EVERY;
      writeSave(world.state);
    }
    for (let i = toasts.length - 1; i >= 0; i -= 1) {
      toasts[i].life -= STEP;
      if (toasts[i].life <= 0) toasts.splice(i, 1);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else if (screen === SCREEN_TITLE) {
      // The title screen reads keys too, or Space could never start the game.
      const c = controlsForFrame();
      handleActions(c);
      if (screen === SCREEN_TITLE) {
        // The living city runs behind the title panel.
        const idle = { moveX: 0, moveY: 0, run: false, steer: 0, gas: false, brake: false, aimX: world.state.player.x, aimY: world.state.player.y, firing: false, enter: false, reload: false, startMission: -1, actions: 0 };
        while (accumulator >= STEP) {
          world.step(STEP, idle);
          accumulator -= STEP;
        }
      }
    } else {
      accumulator = 0;
      // Paused, missions, intro, outro and over all read keys so the player can leave.
      const c = controlsForFrame();
      handleActions(c);
    }
    const ui = {
      screen,
      marker: world.missionMarker(),
      stepText: world.currentStepText(),
      toasts,
      best,
      overReason,
    };
    renderer.draw(world.state, ui, now / 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

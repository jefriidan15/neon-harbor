// The screenshot scenes behind ?shot=cover|chase|city|night. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (drive the road ahead, keep clear of buildings, keep the
// wanted level hot in a chase), so the frame is what real play looks like and
// the same seed always gives the same frame. The scene paints twice and sets
// window.__shotReady for the screenshot tool.

import { STEP } from './config.js';
import { LANDMARKS } from './city.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';

function landmark(name) {
  return LANDMARKS.find((l) => l.name === name);
}

/** Drive toward a waypoint, steering proportional to the heading error. */
function drivePilot(world, tx, ty) {
  const p = world.state.player;
  const car = p.car;
  const base = { moveX: 0, moveY: 0, run: false, steer: 0, gas: false, brake: false, aimX: p.x, aimY: p.y, firing: false, enter: false, reload: false, startMission: -1 };
  if (!car) return base;
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  base.steer = Math.abs(diff) > 0.06 ? Math.sign(diff) : 0;
  base.gas = true;
  return base;
}

/** Walk toward a point, shooting nothing, looking at it. */
function walkPilot(world, tx, ty) {
  const p = world.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    moveX: dx / len, moveY: dy / len, run: false, steer: 0, gas: false, brake: false,
    aimX: tx, aimY: ty, firing: false, enter: false, reload: false, startMission: -1,
  };
}

const IDLE = { moveX: 0, moveY: 0, run: false, steer: 0, gas: false, brake: false, aimX: 0, aimY: 0, firing: false, enter: false, reload: false, startMission: -1 };

/** Stage the player into the nearest usable car at (x, y), facing `angle`. */
function putPlayerInCar(world, x, y, angle) {
  const p = world.state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of world.state.cars) {
    if (car.wreck || car.kind === 'police') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return false;
  best.x = x;
  best.y = y;
  best.angle = angle;
  best.speed = 0;
  p.x = x;
  p.y = y + 44;
  p.angle = angle;
  world.step(STEP, { ...IDLE, aimX: x, aimY: y, enter: true });
  return p.car === best;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * The scenes:
 * - cover: driving Rosa's coupe down the Neon Strip road at golden hour, first job live.
 * - chase: a three-star police chase along the long east road, sirens and all.
 * - city: on foot in Palmetto Plaza, traffic and pedestrians around.
 * - night: cruising the beach road at night, wanted level two, PD in pursuit.
 */
export function stageShot(name, world) {
  const state = world.state;
  const p = state.player;
  const steps = (seconds) => Math.floor(seconds / STEP);
  const idle = { moveX: 0, moveY: 0, run: false, steer: 0, gas: false, brake: false, aimX: p.x, aimY: p.y, firing: false, enter: false, reload: false, startMission: -1 };

  if (name === 'chase') {
    // Steal a car on the east road, then run west with the PD behind.
    putPlayerInCar(world, 2880, 560, Math.PI);
    p.wanted = 3;
    for (let i = 0; i < steps(5); i += 1) {
      const c = drivePilot(world, 300, 536);
      const outcome = world.step(STEP, c);
      if (outcome.events & (EVENT_BUSTED | EVENT_WASTED)) break;
    }
    return { screen: 'play' };
  }

  if (name === 'city') {
    const plaza = landmark('Palmetto Plaza');
    p.x = plaza.x;
    p.y = plaza.y;
    p.wanted = 0;
    for (let i = 0; i < steps(6); i += 1) {
      const c = walkPilot(world, plaza.x + 220, plaza.y + 130);
      world.step(STEP, c);
    }
    return { screen: 'play' };
  }

  if (name === 'night') {
    // Cruise the beach sand westward at night, PD on the tail.
    state.timeOfDay = 22.2;
    putPlayerInCar(world, 2900, 2520, Math.PI);
    p.wanted = 2;
    for (let i = 0; i < steps(5); i += 1) {
      const c = drivePilot(world, 300, 2500);
      const outcome = world.step(STEP, c);
      if (outcome.events & (EVENT_BUSTED | EVENT_WASTED)) break;
    }
    return { screen: 'play' };
  }

  // cover (default): take Rosa's coupe from the garage and run it to Marina Bay.
  state.timeOfDay = 17.3;
  p.x = 660;
  p.y = 640;
  world.step(STEP, { ...idle, enter: true });
  p.wanted = 1;
  for (let i = 0; i < steps(5); i += 1) {
    const c = drivePilot(world, 3050, 536);
    world.step(STEP, c);
  }
  return { screen: 'play' };
}

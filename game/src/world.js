// The simulation: the player on foot and in cars, traffic, pedestrians, the
// Harbor PD, combat, the wanted system, pickups and the mission runner. No
// drawing and no browser here — step() advances one fixed step and returns
// what happened as bit flags plus a list of messages for the HUD and sounds.

import { LANDMARKS, ROAD_XS, ROAD_YS, buildCity, drivable, hitBuilding, resolveBuildings } from './city.js';
import { CAR, DAY_LENGTH, GRID, MONEY, PEDS, PLAYER, POLICE, TRAFFIC, WANTED, WEAPONS, WORLD } from './config.js';
import { missionAt } from './missions.js';
import { angleDelta, clamp, dist } from './random.js';

export const EVENT_SHOT = 1;
export const EVENT_ENEMY_SHOT = 2;
export const EVENT_HIT = 4;
export const EVENT_KILL = 8;
export const EVENT_CRASH = 16;
export const EVENT_PICKUP = 32;
export const EVENT_WANTED = 64;
export const EVENT_MISSION_DONE = 128;
export const EVENT_MISSION_FAIL = 256;
export const EVENT_WASTED = 512;
export const EVENT_BUSTED = 1024;
export const EVENT_MISSION_STEP = 2048;

const CAR_COLORS = ['#d64545', '#3f7fd6', '#e8b93c', '#7bc96f', '#c9c9c9', '#8e44ad', '#e67e22', '#2ecc71', '#e8e8e8'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8'];

function landmark(name) {
  return LANDMARKS.find((l) => l.name === name);
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    time: 0,
    timeOfDay: 9.5,
    city,
    money: MONEY.startCash,
    missionIndex: 0,
    missionsDone: 0,
    kills: 0,
    carsStolen: 0,
    player: null,
    cars: [],
    peds: [],
    police: [],
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    mission: null,
    camera: { x: 0, y: 0 },
    stats: { shots: 0, hits: 0 },
  };

  let nextCarId = 1;

  function makePlayer(x, y) {
    return {
      x, y, angle: -Math.PI / 2, health: PLAYER.health, wanted: 0, wantedTimer: 0,
      car: null, weapon: 'pistol', ammo: WEAPONS.pistol.ammo, reloadTimer: 0, fireTimer: 0,
      invulnerable: 0, moving: false, dead: false,
    };
  }

  function makeCar(x, y, angle, color, kind) {
    return {
      id: nextCarId++, x, y, angle, speed: 0, color, kind,
      hp: 100, wreck: false, missionTag: null, driver: kind === 'traffic',
      routeAxis: random.chance(0.5) ? 'x' : 'y', routeDir: random.chance(0.5) ? 1 : -1,
      cruise: random.range(120, 175), honk: 0,
    };
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const vertical = random.chance(0.5);
      const road = vertical ? random.pick(ROAD_XS) : random.pick(ROAD_YS);
      const along = random.range(GRID.margin, (vertical ? WORLD.height : WORLD.width) - GRID.margin);
      const car = makeCar(
        vertical ? road + (random.chance(0.5) ? 22 : -22) : along,
        vertical ? along : road + (random.chance(0.5) ? 22 : -22),
        vertical ? (Math.PI / 2) * (random.chance(0.5) ? 1 : -1) : (random.chance(0.5) ? 0 : Math.PI),
        random.pick(CAR_COLORS), 'traffic',
      );
      car.speed = car.cruise;
      car.routeAxis = vertical ? 'y' : 'x';
      car.routeDir = car.angle === 0 || car.angle === Math.PI / 2 ? 1 : -1;
      state.cars.push(car);
    }
    for (const spot of city.parked) {
      const car = makeCar(spot.x, spot.y, spot.angle, spot.color, 'parked');
      state.cars.push(car);
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const road = random.pick(ROAD_XS);
      const roadY = random.pick(ROAD_YS);
      const onVertical = random.chance(0.5);
      state.peds.push({
        x: onVertical ? road + random.range(-70, 70) : random.range(GRID.margin, WORLD.width - GRID.margin),
        y: onVertical ? random.range(GRID.margin, WORLD.height - GRID.margin) : roadY + random.range(-70, 70),
        angle: random.range(0, Math.PI * 2),
        speed: random.range(38, 70),
        color: random.pick(PED_COLORS),
        state: 'walk',
        fleeTimer: 0,
        panic: 0,
      });
    }
  }

  function spawnPickups() {
    const spots = [
      { x: 700, y: 900, kind: 'health' },
      { x: 2100, y: 1300, kind: 'ammo' },
      { x: 1500, y: 2100, kind: 'health' },
      { x: 2800, y: 900, kind: 'ammo' },
      { x: 900, y: 2100, kind: 'ammo' },
      { x: 2600, y: 2000, kind: 'health' },
    ];
    for (const spot of spots) state.pickups.push({ ...spot, taken: false, respawn: 0 });
  }

  function resetMissionCars() {
    // Remove old mission cars — except the one the player is driving, which
    // becomes their own car (its mission tag is cleared, not the car itself).
    state.cars = state.cars.filter((c) => {
      if (!c.missionTag) return true;
      if (state.player.car === c) {
        c.missionTag = null;
        c.kind = 'player';
        return true;
      }
      return false;
    });
    const mission = missionAt(state.missionIndex);
    if (!mission) return;
    for (const step of mission.steps) {
      if (step.kind !== 'enter-car') continue;
      if (step.target === 'garage-car') {
        const g = landmark('Rosa\u2019s Garage');
        const car = makeCar(g.x + 40, g.y + 90, 0, '#ffcf3f', 'mission');
        car.missionTag = 'garage-car';
        state.cars.push(car);
      } else if (step.target === 'docks-car') {
        const d = landmark('Harbor Docks');
        const car = makeCar(d.x - 60, d.y + 40, Math.PI / 2, '#d61f2c', 'mission');
        car.missionTag = 'docks-car';
        state.cars.push(car);
      } else if (step.target === 'strip-car') {
        const s = landmark('Neon Strip');
        const car = makeCar(s.x + 30, s.y + 110, 0, '#151515', 'mission');
        car.missionTag = 'strip-car';
        state.cars.push(car);
      }
    }
  }

  function startMission(index) {
    const mission = missionAt(index);
    if (!mission) {
      state.mission = null;
      return;
    }
    state.mission = { index, step: 0, kills: 0, timer: mission.steps[0].timer ?? 0, enemiesSpawned: false, wantedAtStart: false };
    resetMissionCars();
  }

  function reset() {
    state.time = 0;
    state.timeOfDay = 9.5;
    state.money = MONEY.startCash;
    state.missionIndex = 0;
    state.missionsDone = 0;
    state.kills = 0;
    state.carsStolen = 0;
    state.cars = [];
    state.peds = [];
    state.police = [];
    state.enemies = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.player = makePlayer(620, 560);
    nextCarId = 1;
    spawnTraffic();
    spawnPeds();
    spawnPickups();
    startMission(0);
  }

  function addWanted(n, messages) {
    const p = state.player;
    const before = p.wanted;
    p.wanted = clamp(p.wanted + n, 0, WANTED.max);
    p.wantedTimer = 0;
    if (p.wanted > before && messages) messages.push(`Wanted level ${p.wanted} — the Harbor PD is coming.`);
    return p.wanted > before;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, Math.PI * 2);
      const s = random.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(0.3, 0.8), max: 0.8, color, size: random.range(2, 5) });
    }
  }

  function explodeCar(car, messages) {
    car.wreck = true;
    car.speed = 0;
    burst(car.x, car.y, '#ff9d00', 26, 260);
    burst(car.x, car.y, '#3a3a3a', 18, 160);
    burst(car.x, car.y, '#ff5252', 12, 200);
    if (messages) messages.push('Car destroyed!');
    if (state.player.car === car) state.player.car = null;
  }

  function nearestCar(x, y, maxDist, predicate) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.wreck) continue;
      if (predicate && !predicate(car)) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function missionTargetCar() {
    const m = state.mission;
    if (!m) return null;
    const mission = missionAt(m.index);
    const step = mission.steps[m.step];
    if (!step || step.kind !== 'enter-car') return null;
    return state.cars.find((c) => c.missionTag === step.target) || null;
  }

  function missionMarker() {
    const m = state.mission;
    if (!m) return null;
    const mission = missionAt(m.index);
    const step = mission.steps[m.step];
    if (!step) return null;
    if (step.kind === 'goto') return { x: step.at.x, y: step.at.y, label: step.text };
    if (step.kind === 'enter-car') {
      const car = missionTargetCar();
      if (car) return { x: car.x, y: car.y, label: step.text };
    }
    if (step.kind === 'eliminate') return { x: step.at.x, y: step.at.y, label: step.text };
    if (step.kind === 'lose-cops') return null;
    return null;
  }

  function currentStepText() {
    const m = state.mission;
    if (!m) return 'Story complete — Neon Harbor is yours. Free roam!';
    const mission = missionAt(m.index);
    const step = mission.steps[m.step];
    if (!step) return mission.title;
    let text = step.text;
    if (step.kind === 'eliminate') text = `Take out the Marlin crew (${m.kills}/${step.count})`;
    if (step.kind === 'lose-cops') text = `Lose the Harbor PD — wanted ${state.player.wanted}★`;
    if (m.timer > 0) text += ` — ${Math.ceil(m.timer)}s`;
    return `${mission.title}: ${text}`;
  }

  function failMission(messages) {
    const m = state.mission;
    if (!m) return EVENT_MISSION_FAIL;
    messages.push(`Mission failed: ${missionAt(m.index).title}. Talk to Rosa again — the job is still open.`);
    startMission(m.index);
    return EVENT_MISSION_FAIL;
  }

  function advanceStep(messages) {
    const m = state.mission;
    const mission = missionAt(m.index);
    m.step += 1;
    m.kills = 0;
    m.enemiesSpawned = false;
    m.timer = mission.steps[m.step] ? mission.steps[m.step].timer ?? 0 : 0;
    if (m.step >= mission.steps.length) {
      state.money += mission.reward;
      state.missionsDone += 1;
      messages.push(`Mission complete: ${mission.title} — $${mission.reward} earned.`);
      state.missionIndex += 1;
      if (missionAt(state.missionIndex)) {
        messages.push(`New job from Rosa: ${missionAt(state.missionIndex).title}. Press M for details.`);
        startMission(state.missionIndex);
      } else {
        state.mission = null;
        messages.push('Story complete! Neon Harbor is yours — free roam.');
      }
      return EVENT_MISSION_DONE;
    }
    messages.push(mission.steps[m.step].text);
    return EVENT_MISSION_STEP;
  }

  function spawnEnemies(center, count) {
    for (let i = 0; i < count; i += 1) {
      state.enemies.push({
        x: center.x + random.range(-260, 260),
        y: center.y + random.range(-200, 200),
        angle: 0, hp: 60, fireTimer: random.range(0.5, 1.5), speed: 95, state: 'hunt',
      });
    }
  }

  function updateMission(dt, messages) {
    const m = state.mission;
    if (!m) return 0;
    const mission = missionAt(m.index);
    const step = mission.steps[m.step];
    if (!step) return 0;
    let events = 0;
    const p = state.player;
    if (step.kind === 'goto') {
      if (step.timer !== undefined) {
        m.timer -= dt;
        if (m.timer <= 0) return failMission(messages);
      }
      const target = step.at;
      const d = dist(p.x, p.y, target.x, target.y);
      const onFootOk = !step.onFoot || !p.car;
      if (d < step.radius && onFootOk) events |= advanceStep(messages);
    } else if (step.kind === 'eliminate') {
      if (!m.enemiesSpawned) {
        spawnEnemies(step.at, step.count + 2);
        m.enemiesSpawned = true;
      }
      if (m.kills >= step.count) events |= advanceStep(messages);
    } else if (step.kind === 'lose-cops') {
      if (!m.wantedAtStart && p.wanted > 0) m.wantedAtStart = true;
      if (m.wantedAtStart && p.wanted === 0) events |= advanceStep(messages);
    }
    return events;
  }

  function updatePlayer(dt, c, messages) {
    const p = state.player;
    if (p.dead) return 0;
    let events = 0;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    if (p.reloadTimer > 0) p.reloadTimer -= dt;
    if (p.fireTimer > 0) p.fireTimer -= dt;

    if (p.car) {
      const car = p.car;
      const forward = c.gas ? 1 : 0;
      const reverse = c.brake ? 1 : 0;
      if (forward) car.speed += CAR.accel * dt;
      else if (reverse) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
      else car.speed -= car.speed * CAR.drag * dt;
      car.speed = clamp(car.speed, -CAR.maxReverse, car.kind === 'police' ? POLICE.maxSpeed : CAR.maxSpeed);
      const steer = c.steer * (car.speed >= 0 ? 1 : -1);
      car.angle += steer * CAR.turnRate * dt * clamp(Math.abs(car.speed) / 120, 0, 1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const hit = hitBuilding(city.buildings, nx, ny, CAR.length / 2 - 4);
      if (hit) {
        if (Math.abs(car.speed) > 240) {
          events |= EVENT_CRASH;
          burst(car.x, car.y, '#ffd23f', 10, 180);
          car.hp -= 12;
          if (car.hp <= 0) explodeCar(car, messages);
        }
        car.speed *= -0.25;
      } else if (drivable(nx, ny)) {
        car.x = nx;
        car.y = ny;
      } else if (drivable(nx, car.y)) {
        // Slide along the edge instead of stopping dead on grass or a kerb.
        car.x = nx;
        car.speed *= 0.85;
      } else if (drivable(car.x, ny)) {
        car.y = ny;
        car.speed *= 0.85;
      } else {
        car.speed *= 0.4;
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.moving = Math.abs(car.speed) > 20;
      // Running over pedestrians in a car is a crime the city notices.
      for (const ped of state.peds) {
        if (ped.state === 'dead') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
          ped.state = 'dead';
          burst(ped.x, ped.y, '#ff5252', 10, 120);
          addWanted(WANTED.hitPed, messages);
          events |= EVENT_WANTED;
        }
      }
      return events;
    }

    // On foot.
    const speed = c.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const mx = c.moveX;
    const my = c.moveY;
    const len = Math.hypot(mx, my) || 1;
    p.moving = mx !== 0 || my !== 0;
    if (p.moving) {
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.angle = Math.atan2(c.aimY - p.y, c.aimX - p.x);
    } else {
      p.angle = Math.atan2(c.aimY - p.y, c.aimX - p.x);
    }
    p.x = clamp(p.x, 24, WORLD.width - 24);
    p.y = clamp(p.y, 24, WORLD.height - 24);
    resolveBuildings(city.buildings, p, PLAYER.radius);
    // Bumping into a car pushes the player out.
    for (const car of state.cars) {
      if (car.wreck) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < 30 && d > 0.01) {
        p.x = car.x + ((p.x - car.x) / d) * 30;
        p.y = car.y + ((p.y - car.y) / d) * 30;
      }
    }

    // Shooting.
    if (c.firing && p.fireTimer <= 0 && p.reloadTimer <= 0) {
      const weapon = WEAPONS[p.weapon];
      if (p.ammo > 0) {
        p.ammo -= 1;
        p.fireTimer = weapon.fireRate;
        state.stats.shots += 1;
        const spread = (Math.random() - 0.5) * weapon.spread * 2;
        const a = p.angle + spread;
        state.bullets.push({
          x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
          vx: Math.cos(a) * 950, vy: Math.sin(a) * 950,
          life: weapon.range / 950, damage: weapon.damage, fromPlayer: true,
        });
        events |= EVENT_SHOT;
      } else {
        p.reloadTimer = weapon.reload;
      }
    }
    if (c.reload && p.reloadTimer <= 0 && p.ammo < WEAPONS[p.weapon].ammo) {
      p.reloadTimer = WEAPONS[p.weapon].reload;
    }
    if (p.reloadTimer <= 0 && p.ammo === 0) {
      p.ammo = WEAPONS[p.weapon].ammo;
    }
    return events;
  }

  function enterCar(messages) {
    const p = state.player;
    if (p.car) {
      const car = p.car;
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      resolveBuildings(city.buildings, p, PLAYER.radius);
      return 0;
    }
    const car = nearestCar(p.x, p.y, 78);
    if (!car) return 0;
    const missionCar = missionTargetCar();
    if (missionCar && car === missionCar) {
      p.car = car;
      car.driver = true;
      state.carsStolen += 1;
      if (car.missionTag === 'docks-car' || car.missionTag === 'strip-car') {
        addWanted(1, messages);
        if (car.missionTag === 'strip-car') addWanted(2, messages);
      }
      messages.push('In the car. Drive!');
      const m = state.mission;
      if (m) {
        const step = missionAt(m.index).steps[m.step];
        if (step && step.kind === 'enter-car') return advanceStep(messages);
      }
      return 0;
    }
    if (car.kind === 'traffic' || car.kind === 'parked') {
      p.car = car;
      car.driver = true;
      car.kind = 'player';
      state.carsStolen += 1;
      addWanted(WANTED.stealCar, messages);
      messages.push('Car stolen — the owner called it in!');
      return EVENT_WANTED;
    }
    if (car.kind === 'mission') {
      p.car = car;
      car.driver = true;
      messages.push('In the car. Drive!');
      return 0;
    }
    return 0;
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.wreck) continue;
      // Cruise along the current road; turn at intersections sometimes.
      const nearIntersection = ROAD_XS.some((rx) => Math.abs(car.x - rx) < 60) && ROAD_YS.some((ry) => Math.abs(car.y - ry) < 60);
      if (nearIntersection && random.chance(dt * 0.5)) {
        car.routeAxis = car.routeAxis === 'x' ? 'y' : 'x';
        car.routeDir = random.chance(0.5) ? 1 : -1;
        car.angle = car.routeAxis === 'x' ? (car.routeDir > 0 ? 0 : Math.PI) : (car.routeDir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      car.speed = car.cruise;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (drivable(nx, ny) && !hitBuilding(city.buildings, nx, ny, 20)) {
        car.x = nx;
        car.y = ny;
      } else {
        car.angle += Math.PI;
        car.routeDir *= -1;
      }
      // Keep a little distance from the car ahead on the same road.
      for (const other of state.cars) {
        if (other === car || other.wreck) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 46 && d > 0.01) {
          car.x -= ((other.x - car.x) / d) * (46 - d) * 0.5;
          car.y -= ((other.y - car.y) / d) * (46 - d) * 0.5;
        }
      }
    }
  }

  function updatePeds(dt, messages) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.state === 'dead') continue;
      const dPlayer = dist(ped.x, ped.y, p.x, p.y);
      const gunfireNear = state.bullets.length > 0 && dPlayer < 500;
      if ((p.wanted > 0 && dPlayer < 260) || gunfireNear) {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const away = Math.atan2(ped.y - p.y, ped.x - p.x);
        ped.angle = away;
        ped.x += Math.cos(away) * 150 * dt;
        ped.y += Math.sin(away) * 150 * dt;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (random.chance(dt * 0.15)) ped.angle = random.range(0, Math.PI * 2);
        if (!drivable(ped.x, ped.y) || hitBuilding(city.buildings, ped.x, ped.y, 8)) {
          ped.angle += Math.PI * 0.75;
          ped.x = clamp(ped.x, 40, WORLD.width - 40);
          ped.y = clamp(ped.y, 40, WORLD.height - 40);
        }
      }
      ped.x = clamp(ped.x, 30, WORLD.width - 30);
      ped.y = clamp(ped.y, 30, WORLD.height - 30);
    }
  }

  function updatePolice(dt, messages) {
    const p = state.player;
    const wantedUnits = POLICE.unitsByStars[p.wanted] || 0;
    // Spawn what the wanted level calls for, at road edges away from the player.
    while (state.police.length < wantedUnits) {
      const edge = random.pick([
        { x: p.x - 700, y: p.y }, { x: p.x + 700, y: p.y },
        { x: p.x, y: p.y - 700 }, { x: p.x, y: p.y + 700 },
      ]);
      const car = makeCar(clamp(edge.x, 80, WORLD.width - 80), clamp(edge.y, 80, WORLD.height - 80), 0, '#1c2733', 'police');
      car.speed = 200;
      state.police.push(car);
      state.cars.push(car);
    }
    while (state.police.length > wantedUnits) {
      const car = state.police.pop();
      const index = state.cars.indexOf(car);
      if (index >= 0) state.cars.splice(index, 1);
    }
    for (const car of state.police) {
      const d = dist(car.x, car.y, p.x, p.y);
      const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
      car.angle += clamp(angleDelta(car.angle, targetAngle), -2.2 * dt, 2.2 * dt);
      const wantSpeed = d > 90 ? POLICE.maxSpeed : 260;
      car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.4);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!hitBuilding(city.buildings, nx, ny, CAR.length / 2 - 4) && nx > 20 && nx < WORLD.width - 20 && ny > 20 && ny < WORLD.height - 20) {
        car.x = nx;
        car.y = ny;
      } else {
        car.speed *= 0.5;
        car.angle += 0.6;
      }
      // Ram the player: on foot it hurts, in a car it wrecks.
      if (d < 34) {
        if (p.car) {
          p.car.hp -= 22 * dt;
          if (p.car.hp <= 0) explodeCar(p.car, messages);
          burst(p.x, p.y, '#ffd23f', 3, 140);
        } else if (p.invulnerable <= 0) {
          p.health -= 26 * dt;
          p.invulnerable = 0.5;
          burst(p.x, p.y, '#ff5252', 6, 140);
        }
      }
      // At three stars and up, officers shoot from the car.
      if (p.wanted >= POLICE.shootAboveStars && d < 420 && d > 60 && random.chance(dt * 0.9)) {
        const a = targetAngle + random.range(-0.14, 0.14);
        state.bullets.push({
          x: car.x, y: car.y, vx: Math.cos(a) * 800, vy: Math.sin(a) * 800,
          life: 0.55, damage: 9, fromPlayer: false,
        });
      }
    }
    // Wanted fades when the player stays clean and out of sight.
    if (p.wanted > 0) {
      const nearestCop = state.police.reduce((best, car) => Math.min(best, dist(car.x, car.y, p.x, p.y)), Infinity);
      if (nearestCop > 520) {
        p.wantedTimer += dt;
        if (p.wantedTimer > POLICE.coolDownPerStar) {
          p.wanted -= 1;
          p.wantedTimer = 0;
          messages.push(p.wanted === 0 ? 'You lost the cops. Clean — for now.' : `Wanted level down to ${p.wanted}.`);
        }
      } else {
        p.wantedTimer = 0;
      }
    }
  }

  function updateEnemies(dt, messages) {
    const p = state.player;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      const targetAngle = Math.atan2(p.y - e.y, p.x - e.x);
      e.angle = targetAngle;
      if (d > 260) {
        e.x += Math.cos(targetAngle) * e.speed * dt;
        e.y += Math.sin(targetAngle) * e.speed * dt;
      }
      resolveBuildings(city.buildings, e, 12);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < 430 && !p.dead) {
        e.fireTimer = random.range(0.9, 1.7);
        const a = targetAngle + random.range(-0.12, 0.12);
        state.bullets.push({
          x: e.x, y: e.y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760,
          life: 0.6, damage: 8, fromPlayer: false,
        });
      }
    }
    state.enemies = state.enemies.filter((e) => e.hp > 0);
  }

  function updateBullets(dt, messages) {
    let events = 0;
    const p = state.player;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (hitBuilding(city.buildings, b.x, b.y, 2)) {
        burst(b.x, b.y, '#c9c9c9', 3, 90);
        b.life = 0;
        continue;
      }
      if (b.fromPlayer) {
        let hitSomething = false;
        for (const e of state.enemies) {
          if (e.hp > 0 && dist(b.x, b.y, e.x, e.y) < 16) {
            e.hp -= b.damage;
            state.stats.hits += 1;
            burst(b.x, b.y, '#ff5252', 6, 130);
            if (e.hp <= 0) {
              state.kills += 1;
              const m = state.mission;
              if (m) m.kills += 1;
              burst(e.x, e.y, '#ff5252', 14, 170);
              messages.push('Rival down.');
              events |= EVENT_KILL;
            }
            hitSomething = true;
            break;
          }
        }
        if (!hitSomething) {
          for (const ped of state.peds) {
            if (ped.state !== 'dead' && dist(b.x, b.y, ped.x, ped.y) < 14) {
              ped.state = 'dead';
              state.stats.hits += 1;
              burst(ped.x, ped.y, '#ff5252', 10, 140);
              addWanted(WANTED.killPed, messages);
              events |= EVENT_WANTED;
              hitSomething = true;
              break;
            }
          }
        }
        if (!hitSomething) {
          for (const car of state.cars) {
            if (car.wreck || car === p.car) continue;
            if (dist(b.x, b.y, car.x, car.y) < 28) {
              car.hp -= b.damage;
              state.stats.hits += 1;
              burst(b.x, b.y, '#ffd23f', 4, 110);
              if (car.kind === 'police') addWanted(WANTED.killCop, messages);
              if (car.hp <= 0) explodeCar(car, messages);
              hitSomething = true;
              break;
            }
          }
        }
        if (hitSomething) b.life = 0;
      } else if (!p.dead && !p.car && dist(b.x, b.y, p.x, p.y) < 14 && p.invulnerable <= 0) {
        p.health -= b.damage;
        p.invulnerable = 0.25;
        burst(p.x, p.y, '#ff5252', 5, 120);
        events |= EVENT_HIT;
        b.life = 0;
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function updatePickups(dt, messages) {
    const p = state.player;
    for (const item of state.pickups) {
      if (item.taken) {
        item.respawn -= dt;
        if (item.respawn <= 0) item.taken = false;
        continue;
      }
      if (dist(p.x, p.y, item.x, item.y) < 34) {
        item.taken = true;
        item.respawn = 45;
        if (item.kind === 'health') {
          p.health = Math.min(PLAYER.health, p.health + 50);
          messages.push('+50 health');
        } else {
          p.ammo = WEAPONS[p.weapon].ammo;
          messages.push('Ammo restocked');
        }
        return EVENT_PICKUP;
      }
    }
    return 0;
  }

  function updateParticles(dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
  }

  function updateCamera() {
    const p = state.player;
    state.camera.x = p.x;
    state.camera.y = p.y;
  }

  /**
   * One fixed step. `c` is the controls object main.js builds from input:
   * moveX/moveY (-1..1), run, steer (-1..1), gas, brake, aimX/aimY (world),
   * firing, enter, reload, and startMission (mission index to begin, or -1).
   * Returns { events, messages }.
   */
  function step(dt, c) {
    const messages = [];
    let events = 0;
    state.time += dt;
    state.timeOfDay = (state.timeOfDay + dt * (24 / DAY_LENGTH)) % 24;

    if (c.startMission >= 0 && c.startMission !== state.missionIndex) {
      state.missionIndex = c.startMission;
      startMission(c.startMission);
      messages.push(`Job accepted: ${missionAt(c.startMission).title}`);
    }
    if (c.enter) events |= enterCar(messages);
    events |= updatePlayer(dt, c, messages);
    updateTraffic(dt);
    updatePeds(dt, messages);
    events |= updatePolice(dt, messages);
    updateEnemies(dt, messages);
    events |= updateBullets(dt, messages);
    events |= updatePickups(dt, messages);
    events |= updateMission(dt, messages);
    updateParticles(dt);
    updateCamera();

    const p = state.player;
    if (!p.dead && p.health <= 0) {
      p.dead = true;
      if (p.wanted > 0) {
        events |= EVENT_BUSTED;
        messages.push('BUSTED! The Harbor PD took you in. You lose half your cash.');
        state.money = Math.floor(state.money / 2);
      } else {
        events |= EVENT_WASTED;
        messages.push('WASTED! You wake up at the marina clinic, lighter in the wallet.');
        state.money = Math.floor(state.money / 2);
      }
      if (state.mission) startMission(state.missionIndex);
    }
    return { events, messages };
  }

  function respawn() {
    const p = state.player;
    p.dead = false;
    p.health = PLAYER.health;
    p.wanted = 0;
    p.car = null;
    const g = landmark('Rosa\u2019s Garage');
    p.x = g.x;
    p.y = g.y + 140;
    state.police = [];
    state.cars = state.cars.filter((car) => car.kind !== 'police');
    state.enemies = [];
    state.bullets = [];
  }

  reset();
  return {
    state, city, reset, step, respawn, missionMarker, currentStepText, startMission,
    applySave(save) {
      if (!save) return;
      state.money = save.money ?? state.money;
      state.missionIndex = save.missionIndex ?? 0;
      state.missionsDone = save.missionsDone ?? 0;
      if (save.x !== undefined && save.y !== undefined) {
        state.player.x = save.x;
        state.player.y = save.y;
      }
      if (save.timeOfDay !== undefined) state.timeOfDay = save.timeOfDay;
      startMission(state.missionIndex);
    },
  };
}

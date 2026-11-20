// Neon Harbor's city: a seeded grid of streets and blocks, a sandy beach along
// the south edge, a working harbor along the east edge, a central park, and
// named landmarks the missions point at. Pure data — no drawing here — so the
// simulation and the renderer both read the same city.

import { GRID, PALETTE, WORLD } from './config.js';

export const ROAD_XS = [];
export const ROAD_YS = [];
for (let x = GRID.margin; x <= WORLD.width - GRID.margin; x += GRID.block + GRID.road) ROAD_XS.push(x);
for (let y = GRID.margin; y <= WORLD.height - GRID.margin; y += GRID.block + GRID.road) ROAD_YS.push(y);

/** The beach strip along the south edge, and the harbor strip along the east. */
export const BEACH = { y: WORLD.height - 150, height: 150 };
export const HARBOR = { x: WORLD.width - 170, width: 170 };

/** Named places the story and the HUD know by name. */
export const LANDMARKS = [
  { name: 'Rosa\u2019s Garage', x: 620, y: 480, kind: 'garage' },
  { name: 'Palmetto Plaza', x: 1650, y: 830, kind: 'plaza' },
  { name: 'Harbor Docks', x: 3050, y: 1250, kind: 'docks' },
  { name: 'Sunset Pier', x: 1750, y: 2450, kind: 'pier' },
  { name: 'Coral Park', x: 1250, y: 1650, kind: 'park' },
  { name: 'Neon Strip', x: 2450, y: 480, kind: 'strip' },
  { name: 'Marina Bay', x: 3050, y: 480, kind: 'marina' },
  { name: 'Old Town', x: 620, y: 1650, kind: 'oldtown' },
];

/** Is a point on a road (inside the asphalt, not the sidewalk)? */
export function onRoad(x, y) {
  const half = GRID.road / 2;
  for (const rx of ROAD_XS) {
    if (Math.abs(x - rx) < half && y > GRID.margin - half && y < WORLD.height - GRID.margin + half) return true;
  }
  for (const ry of ROAD_YS) {
    if (Math.abs(y - ry) < half && x > GRID.margin - half && x < WORLD.width - GRID.margin + half) return true;
  }
  return false;
}

/** Is a point inside the drivable area (roads, beach sand, harbor yard)? */
export function drivable(x, y) {
  if (x < 20 || y < 20 || x > WORLD.width - 20 || y > WORLD.height - 20) return false;
  if (y > BEACH.y) return true;
  if (x > HARBOR.x) return true;
  return onRoad(x, y);
}

/** Snap a point to the nearest road centre line. */
export function nearestRoadPoint(x, y) {
  let bestX = ROAD_XS[0];
  let bestD = Infinity;
  for (const rx of ROAD_XS) {
    const d = Math.abs(rx - x);
    if (d < bestD) {
      bestD = d;
      bestX = rx;
    }
  }
  let bestY = ROAD_YS[0];
  bestD = Infinity;
  for (const ry of ROAD_YS) {
    const d = Math.abs(ry - y);
    if (d < bestD) {
      bestD = d;
      bestY = ry;
    }
  }
  return { x: bestX, y: bestY };
}

/**
 * Build the city from a seeded random source: one or two buildings per block,
 * palms along the beach and the park, and a scatter of parked cars. Returns
 * plain arrays the world and the renderer share.
 */
export function buildCity(random) {
  const buildings = [];
  const palms = [];
  const parked = [];
  const carColors = ['#d64545', '#3f7fd6', '#e8b93c', '#7bc96f', '#c9c9c9', '#8e44ad', '#e67e22', '#2ecc71'];

  for (let bx = 0; bx < ROAD_XS.length - 1; bx += 1) {
    for (let by = 0; by < ROAD_YS.length - 1; by += 1) {
      const x0 = ROAD_XS[bx] + GRID.road / 2 + 14;
      const y0 = ROAD_YS[by] + GRID.road / 2 + 14;
      const x1 = ROAD_XS[bx + 1] - GRID.road / 2 - 14;
      const y1 = ROAD_YS[by + 1] - GRID.road / 2 - 14;
      if (x1 < x0 + 60 || y1 < y0 + 60) continue;
      // The central park block stays green.
      if (bx === 3 && by === 3) {
        for (let i = 0; i < 10; i += 1) {
          palms.push({ x: random.range(x0, x1), y: random.range(y0, y1), size: random.range(10, 15) });
        }
        continue;
      }
      const count = random.chance(0.35) ? 1 : 2;
      for (let i = 0; i < count; i += 1) {
        const w = random.range(90, Math.min(200, x1 - x0 - 20));
        const h = random.range(70, Math.min(170, y1 - y0 - 20));
        const x = x0 + (count === 1 ? (x1 - x0 - w) / 2 : i === 0 ? 6 : x1 - x0 - w - 6);
        const y = y0 + random.range(6, Math.max(7, y1 - y0 - h - 6));
        buildings.push({
          x,
          y,
          w,
          h,
          roof: random.pick(PALETTE.buildingRoof),
          floors: random.int(1, 4),
          sign: random.chance(0.3),
        });
      }
      // A parked car or two along the block's edge road.
      if (random.chance(0.55)) {
        parked.push({
          x: ROAD_XS[bx] + GRID.road / 2 + 16,
          y: random.range(y0, y1),
          angle: Math.PI / 2,
          color: random.pick(carColors),
        });
      }
    }
  }

  // Palm rows along the beach and the harbor promenade.
  for (let x = 120; x < WORLD.width - 220; x += 130) {
    palms.push({ x: x + random.range(-20, 20), y: BEACH.y + 55 + random.range(-12, 12), size: random.range(12, 17) });
  }
  for (let y = 200; y < WORLD.height - 200; y += 170) {
    palms.push({ x: HARBOR.x - 40 + random.range(-10, 10), y, size: random.range(11, 15) });
  }

  return { buildings, palms, parked, carColors };
}

/** Does a circle of radius r at (x, y) hit any building? Returns the building or null. */
export function hitBuilding(buildings, x, y, r) {
  for (const b of buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true when it moved. */
export function resolveBuildings(buildings, body, r) {
  let moved = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 < 0.0001) {
      body.y = b.y - r;
    } else {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * r;
      body.y = cy + (dy / d) * r;
    }
    moved = true;
  }
  return moved;
}

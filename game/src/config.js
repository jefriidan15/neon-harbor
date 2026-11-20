// Neon Harbor tuning: every number and colour the game uses lives here, so a
// balance pass touches this file only. The world is a fixed-size top-down city;
// the renderer scales the view to the window, so no rule depends on screen size.

export const STEP = 1 / 60;

/** The whole city, in world units. South edge is the beach, east edge the harbor. */
export const WORLD = { width: 3400, height: 2600 };

/** City grid: roads run every BLOCK+ROAD units, leaving buildable blocks between. */
export const GRID = { block: 300, road: 96, margin: 140 };

/** The in-game clock: one full day lasts this many real seconds. */
export const DAY_LENGTH = 480;

export const PLAYER = {
  radius: 13,
  walkSpeed: 235,
  runSpeed: 330,
  health: 100,
  punchDamage: 12,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 170,
  turnRate: 2.5,
  drag: 0.55,
  grip: 6.5,
};

export const POLICE = {
  maxSpeed: 600,
  accel: 470,
  /** Wanted stars -> how many police units hunt the player at once. */
  unitsByStars: [0, 1, 2, 3, 4, 6],
  /** Seconds with no crime and no officer nearby before a star fades. */
  coolDownPerStar: 14,
  shootAboveStars: 3,
};

export const TRAFFIC = { count: 26, speed: 150 };
export const PEDS = { count: 42, speed: 55 };

export const WEAPONS = {
  pistol: { damage: 34, fireRate: 0.22, range: 420, ammo: 12, reload: 1.1, spread: 0.05 },
  smg: { damage: 18, fireRate: 0.09, range: 360, ammo: 30, reload: 1.4, spread: 0.11 },
};

export const WANTED = {
  stealCar: 1,
  shoot: 1,
  hitPed: 1,
  killPed: 2,
  killCop: 2,
  max: 5,
};

/** Cash rewards and fines, in harbor dollars. */
export const MONEY = {
  missionReward: [600, 900, 1400, 1800, 3500],
  startCash: 250,
  carTheftFine: 0,
};

export const PALETTE = {
  grass: '#3f7d4a',
  grassDark: '#356b3f',
  sand: '#e8d29a',
  water: '#1d6f9e',
  waterDeep: '#155a82',
  road: '#2e3138',
  roadEdge: '#4a4e57',
  lane: '#d8c84a',
  sidewalk: '#8f9296',
  buildingRoof: ['#b0563a', '#3a6db0', '#c98a2e', '#7a4a8f', '#4a8f6d', '#a03a4a'],
  buildingWall: '#5c5648',
  park: '#2f6b35',
  palm: '#2e7d32',
  palmTrunk: '#7a5a34',
  player: '#ffcf3f',
  playerJacket: '#1e88e5',
  police: '#1c2733',
  policeLight: ['#ff2d2d', '#2d7dff'],
  hudPanel: 'rgba(8, 12, 24, 0.72)',
  hudText: '#f2f5f8',
  hudAccent: '#ffd23f',
  hudDanger: '#ff5252',
  hudGood: '#69f0ae',
  nightTint: 'rgba(10, 16, 48, 0.42)',
  duskTint: 'rgba(255, 110, 60, 0.16)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** localStorage keys for the save slot. */
export const SAVE_KEY = 'neon-harbor.save.v1';
export const BEST_KEY = 'neon-harbor.best.v1';

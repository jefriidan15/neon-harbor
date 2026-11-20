// The story of Neon Harbor: five jobs for Rosa, the garage owner who runs the
// city's quiet side. Each mission is a list of steps; a step is either "go to
// a place", "get in the marked car", "take out N rivals" or "lose the cops".
// The world runs the steps; this file only describes them.

import { LANDMARKS } from './city.js';

function at(name) {
  const place = LANDMARKS.find((l) => l.name === name);
  return { x: place.x, y: place.y, name: place.name };
}

export const STORY_INTRO = [
  'Neon Harbor. Sun, salt, and everybody owes somebody.',
  'Rosa runs the garage on Palmetto Row. She has work for you.',
  'Do her jobs, earn cash, and stay out of the Harbor PD\u2019s way.',
];

export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'First Shift',
    giver: 'Rosa',
    brief: 'Take my coupe from the garage to the Marina Bay drop-off. Don\u2019t scratch it.',
    reward: 600,
    steps: [
      { kind: 'enter-car', target: 'garage-car', text: 'Get in Rosa\u2019s coupe at the garage' },
      { kind: 'goto', at: at('Marina Bay'), radius: 90, text: 'Drive the coupe to Marina Bay' },
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    giver: 'Rosa',
    brief: 'A package is waiting at Palmetto Plaza. Pick it up on foot and walk it to Old Town. Fast — the buyer hates waiting.',
    reward: 900,
    steps: [
      { kind: 'goto', at: at('Palmetto Plaza'), radius: 70, text: 'Pick up the package at Palmetto Plaza', onFoot: true },
      { kind: 'goto', at: at('Old Town'), radius: 70, text: 'Deliver the package to Old Town', onFoot: true, timer: 75 },
    ],
  },
  {
    id: 'harbor-heat',
    title: 'Harbor Heat',
    giver: 'Rosa',
    brief: 'A cherry-red Comet is parked at the docks. The owner won\u2019t miss it. Bring it to my garage — and expect the PD to notice.',
    reward: 1400,
    steps: [
      { kind: 'enter-car', target: 'docks-car', text: 'Steal the red Comet at the Harbor Docks' },
      { kind: 'goto', at: at('Rosa\u2019s Garage'), radius: 90, text: 'Deliver the Comet to Rosa\u2019s Garage' },
    ],
  },
  {
    id: 'dockside-trouble',
    title: 'Dockside Trouble',
    giver: 'Rosa',
    brief: 'The Marlin crew is muscling in on my dock contracts. Go to the docks and send them a message they can read. Bring a gun.',
    reward: 1800,
    steps: [
      { kind: 'goto', at: at('Harbor Docks'), radius: 120, text: 'Reach the Harbor Docks' },
      { kind: 'eliminate', count: 5, at: at('Harbor Docks'), radius: 320, text: 'Take out the Marlin crew (0/5)' },
    ],
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    giver: 'Rosa',
    brief: 'Steal the black Vanta on the Neon Strip, lose the cops, deliver it to Sunset Pier.',
    reward: 3500,
    steps: [
      { kind: 'enter-car', target: 'strip-car', text: 'Steal the black Vanta on the Neon Strip' },
      { kind: 'lose-cops', text: 'Lose the Harbor PD (get your wanted level to zero)' },
      { kind: 'goto', at: at('Sunset Pier'), radius: 90, text: 'Deliver the Vanta to Sunset Pier' },
    ],
  },
];

export const STORY_OUTRO = [
  'Five jobs. Five clean getaways.',
  'Rosa slides the last envelope across the counter and grins.',
  'Neon Harbor is yours now, kid. Try not to burn it down.',
];

/** The mission after `index`, or null when the story is done. */
export function missionAt(index) {
  return index >= 0 && index < MISSIONS.length ? MISSIONS[index] : null;
}

/** A short label for the mission list screen. */
export function missionLabel(mission, done) {
  return `${done ? '\u2713 ' : ''}${mission.title} — $${mission.reward}`;
}

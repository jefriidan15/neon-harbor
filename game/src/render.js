// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player; the world is drawn in world units and the HUD in
// screen units. Flat shapes, canvas text and a day/night tint — no images.

import { BEACH, HARBOR, LANDMARKS, ROAD_XS, ROAD_YS } from './city.js';
import { CAR, FONT, GRID, PALETTE, PLAYER, WORLD } from './config.js';
import { MISSIONS, STORY_INTRO, STORY_OUTRO, missionLabel } from './missions.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';

const VIEW_W = 1280;
const VIEW_H = 720;
const MINIMAP = { w: 230, h: 176, margin: 14 };

function isNight(timeOfDay) {
  return timeOfDay < 6 || timeOfDay > 19.5;
}
function isDusk(timeOfDay) {
  return (timeOfDay >= 17.5 && timeOfDay <= 19.5) || (timeOfDay >= 5 && timeOfDay <= 6.5);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    offsetX = (canvas.width - VIEW_W * scale) / 2;
    offsetY = (canvas.height - VIEW_H * scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(8, 12, 24, ${alpha === undefined ? 0.78 : alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawWorld(state, marker, time) {
    const cam = state.camera;
    const viewLeft = cam.x - VIEW_W / 2;
    const viewTop = cam.y - VIEW_H / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();
    ctx.translate(-viewLeft, -viewTop);

    // Ground: grass, then sand and water at the edges.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(viewLeft - 40, viewTop - 40, VIEW_W + 80, VIEW_H + 80);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(viewLeft - 40, BEACH.y, VIEW_W + 80, BEACH.height + 40);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(viewLeft - 40, WORLD.height - 60, VIEW_W + 80, 100);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(HARBOR.x, viewTop - 40, HARBOR.width + 40, VIEW_H + 80);
    // Harbor piers.
    ctx.fillStyle = '#6b5a44';
    for (let y = 300; y < WORLD.height - 200; y += 420) {
      ctx.fillRect(HARBOR.x - 90, y, 130, 26);
    }
    // Park block.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(ROAD_XS[3] + GRID.road / 2, ROAD_YS[3] + GRID.road / 2, GRID.block, GRID.block);

    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROAD_XS) ctx.fillRect(rx - GRID.road / 2, GRID.margin - GRID.road / 2, GRID.road, WORLD.height - 2 * GRID.margin + GRID.road);
    for (const ry of ROAD_YS) ctx.fillRect(GRID.margin - GRID.road / 2, ry - GRID.road / 2, WORLD.width - 2 * GRID.margin + GRID.road, GRID.road);
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of ROAD_XS) {
      for (let y = GRID.margin; y < WORLD.height - GRID.margin; y += 64) {
        if (y > viewTop - 80 && y < viewTop + VIEW_H + 80) ctx.fillRect(rx - 2, y, 4, 30);
      }
    }
    for (const ry of ROAD_YS) {
      for (let x = GRID.margin; x < WORLD.width - GRID.margin; x += 64) {
        if (x > viewLeft - 80 && x < viewLeft + VIEW_W + 80) ctx.fillRect(x, ry - 2, 30, 4);
      }
    }

    // Buildings.
    for (const b of state.city.buildings) {
      if (b.x > viewLeft + VIEW_W + 40 || b.x + b.w < viewLeft - 40 || b.y > viewTop + VIEW_H + 40 || b.y + b.h < viewTop - 40) continue;
      ctx.fillStyle = '#3d3831';
      ctx.fillRect(b.x + 4, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 30));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          ctx.fillRect(b.x + 10 + cx * 34, b.y + 10 + cy * 30, 16, 12);
        }
      }
      if (b.sign) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(b.x + b.w / 2 - 22, b.y - 8, 44, 8);
      }
    }

    // Palms.
    for (const palm of state.city.palms) {
      if (palm.x < viewLeft - 40 || palm.x > viewLeft + VIEW_W + 40 || palm.y < viewTop - 40 || palm.y > viewTop + VIEW_H + 40) continue;
      ctx.strokeStyle = PALETTE.palmTrunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(palm.x + 3, palm.y - 12);
      ctx.stroke();
      ctx.fillStyle = PALETTE.palm;
      ctx.beginPath();
      ctx.arc(palm.x + 3, palm.y - 14, palm.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Landmark labels.
    ctx.textAlign = 'center';
    for (const lm of LANDMARKS) {
      if (lm.x < viewLeft - 60 || lm.x > viewLeft + VIEW_W + 60 || lm.y < viewTop - 60 || lm.y > viewTop + VIEW_H + 60) continue;
      text(lm.name, lm.x, lm.y - 14, 15, 'rgba(255,255,255,0.75)', 'center', '600');
    }

    // Pickups.
    for (const item of state.pickups) {
      if (item.taken) continue;
      const bob = Math.sin(time * 3 + item.x) * 3;
      ctx.fillStyle = item.kind === 'health' ? '#ff5252' : '#ffd23f';
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      text(item.kind === 'health' ? '+' : 'A', item.x, item.y + bob + 5, 15, '#0b1020', 'center', '700');
    }

    // Mission marker: a pulsing beacon and a guide line from the player.
    if (marker) {
      const pulse = 1 + Math.sin(time * 4) * 0.18;
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(marker.x, marker.y - 34);
      ctx.lineTo(marker.x - 9, marker.y - 14);
      ctx.lineTo(marker.x + 9, marker.y - 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.35)';
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(state.player.x, state.player.y);
      ctx.lineTo(marker.x, marker.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Cars.
    for (const car of state.cars) {
      if (car.x < viewLeft - 80 || car.x > viewLeft + VIEW_W + 80 || car.y < viewTop - 80 || car.y > viewTop + VIEW_H + 80) continue;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width);
      ctx.fillStyle = car.wreck ? '#222222' : car.color;
      ctx.fillRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width);
      ctx.fillStyle = car.wreck ? '#111111' : 'rgba(180, 220, 255, 0.75)';
      ctx.fillRect(-CAR.length / 2 + 12, -CAR.width / 2 + 4, 14, CAR.width - 8);
      ctx.fillStyle = car.wreck ? '#111111' : 'rgba(180, 220, 255, 0.55)';
      ctx.fillRect(CAR.length / 2 - 18, -CAR.width / 2 + 4, 10, CAR.width - 8);
      if (car.kind === 'police') {
        const blink = Math.floor(time * 6) % 2 === 0;
        ctx.fillStyle = blink ? '#ff2d2d' : '#2d7dff';
        ctx.fillRect(-6, -CAR.width / 2 - 3, 12, 6);
        ctx.fillStyle = '#ffffff';
        text('PD', 0, 5, 11, '#ffffff', 'center', '700');
      }
      if (car.missionTag) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(-CAR.length / 2, -CAR.width / 2 - 8, CAR.length, 4);
      }
      ctx.restore();
    }

    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.state === 'dead' || ped.x < viewLeft - 40 || ped.x > viewLeft + VIEW_W + 40 || ped.y < viewTop - 40 || ped.y > viewTop + VIEW_H + 40) continue;
      const walk = ped.state === 'flee' ? Math.sin(time * 14) * 2 : Math.sin(time * 6 + ped.x) * 1.5;
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y + walk * 0.3, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y - 2 + walk * 0.3, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies.
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      ctx.fillStyle = '#8e2f3c';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(e.x, e.y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(e.x - 14, e.y - 22, 28, 4);
      ctx.fillStyle = '#69f0ae';
      ctx.fillRect(e.x - 14, e.y - 22, 28 * clamp(e.hp / 60, 0, 1), 4);
    }

    // Bullets.
    ctx.fillStyle = '#ffe082';
    for (const b of state.bullets) {
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }

    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // The player.
    const p = state.player;
    if (!p.dead) {
      if (p.car) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const blink = p.invulnerable > 0 && Math.floor(time * 12) % 2 === 0;
        if (!blink) {
          const bob = p.moving ? Math.sin(time * 12) * 2 : 0;
          ctx.save();
          ctx.translate(p.x, p.y + bob * 0.3);
          ctx.rotate(p.angle);
          ctx.fillStyle = PALETTE.playerJacket;
          ctx.beginPath();
          ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f2c89b';
          ctx.beginPath();
          ctx.arc(4, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#222222';
          ctx.fillRect(PLAYER.radius - 2, -3, 12, 6);
          ctx.restore();
        }
        // Aim line.
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
        ctx.lineTo(p.x + Math.cos(p.angle) * 46, p.y + Math.sin(p.angle) * 46);
        ctx.stroke();
      }
    }

    // Day/night tint and headlights at night.
    if (isNight(state.timeOfDay)) {
      ctx.fillStyle = PALETTE.nightTint;
      ctx.fillRect(viewLeft - 40, viewTop - 40, VIEW_W + 80, VIEW_H + 80);
      for (const car of state.cars) {
        if (car.wreck) continue;
        const gx = car.x + Math.cos(car.angle) * 46;
        const gy = car.y + Math.sin(car.angle) * 46;
        const grad = ctx.createRadialGradient(gx, gy, 4, gx, gy, 90);
        grad.addColorStop(0, 'rgba(255, 244, 180, 0.35)');
        grad.addColorStop(1, 'rgba(255, 244, 180, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, 90, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (isDusk(state.timeOfDay)) {
      ctx.fillStyle = PALETTE.duskTint;
      ctx.fillRect(viewLeft - 40, viewTop - 40, VIEW_W + 80, VIEW_H + 80);
    }
    ctx.restore();
  }

  function drawMinimap(state, marker) {
    const x0 = VIEW_W - MINIMAP.w - MINIMAP.margin;
    const y0 = MINIMAP.margin;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    panel(x0 - 6, y0 - 6, MINIMAP.w + 12, MINIMAP.h + 12, 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, MINIMAP.w, MINIMAP.h);
    ctx.clip();
    ctx.fillStyle = '#2c5d33';
    ctx.fillRect(x0, y0, MINIMAP.w, MINIMAP.h);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(x0, y0 + MINIMAP.h - 10, MINIMAP.w, 10);
    ctx.fillStyle = '#1d6f9e';
    ctx.fillRect(x0 + MINIMAP.w - 12, y0, 12, MINIMAP.h);
    ctx.fillStyle = '#3a3f47';
    for (const rx of ROAD_XS) ctx.fillRect(x0 + rx * sx - 1, y0, 2, MINIMAP.h);
    for (const ry of ROAD_YS) ctx.fillRect(x0, y0 + ry * sy - 1, MINIMAP.w, 2);
    if (marker) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x0 + marker.x * sx, y0 + marker.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.police) {
      ctx.fillStyle = '#2d7dff';
      ctx.fillRect(x0 + car.x * sx - 2, y0 + car.y * sy - 2, 4, 4);
    }
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // North marker.
    text('N', x0 + MINIMAP.w / 2, y0 + MINIMAP.h + 16, 12, '#ffffff', 'center', '700');
  }

  function drawHud(state, stepText, toasts, time) {
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Top-left: cash and health.
    panel(14, 14, 250, 84, 0.72);
    text(`$${state.money.toLocaleString('en-US')}`, 28, 48, 26, PALETTE.hudAccent, 'left', '700');
    text(`Jobs done: ${state.missionsDone}/5`, 28, 74, 15, PALETTE.hudText, 'left');
    ctx.fillStyle = '#333a45';
    ctx.fillRect(28, 82, 180, 10);
    ctx.fillStyle = p.health > 40 ? PALETTE.hudGood : PALETTE.hudDanger;
    ctx.fillRect(28, 82, 180 * clamp(p.health / 100, 0, 1), 10);
    text(`${Math.ceil(p.health)}`, 214, 92, 13, PALETTE.hudText, 'left', '700');

    // Wanted stars, top centre.
    if (p.wanted > 0) {
      const stars = '\u2605'.repeat(p.wanted) + '\u2606'.repeat(5 - p.wanted);
      const flash = Math.floor(time * 3) % 2 === 0;
      panel(VIEW_W / 2 - 130, 14, 260, 44, 0.72);
      text(stars, VIEW_W / 2, 46, 26, flash ? '#ffd23f' : '#ff5252', 'center', '700');
    }

    // Clock + weapon, bottom-right.
    const hours = Math.floor(state.timeOfDay);
    const minutes = Math.floor((state.timeOfDay - hours) * 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    panel(VIEW_W - 214, VIEW_H - 64, 200, 50, 0.72);
    text(clock, VIEW_W - 200, VIEW_H - 32, 20, PALETTE.hudText, 'left', '700');
    if (!p.car) {
      const weapon = p.weapon === 'pistol' ? 'PISTOL' : 'SMG';
      text(`${weapon}  ${p.ammo}`, VIEW_W - 118, VIEW_H - 32, 20, PALETTE.hudText, 'left', '700');
    } else {
      const speed = Math.round(Math.abs(p.car.speed) * 0.22);
      text(`${speed} km/h`, VIEW_W - 118, VIEW_H - 32, 20, PALETTE.hudText, 'left', '700');
    }

    // Mission objective, bottom centre.
    panel(VIEW_W / 2 - 330, VIEW_H - 58, 660, 44, 0.72);
    text(stepText, VIEW_W / 2, VIEW_H - 30, 17, PALETTE.hudText, 'center', '600');

    // Toast messages, stacked above the objective.
    let ty = VIEW_H - 76;
    for (let i = toasts.length - 1; i >= 0; i -= 1) {
      const toast = toasts[i];
      ctx.globalAlpha = clamp(toast.life / 1.2, 0, 1);
      text(toast.text, VIEW_W / 2, ty, 16, '#ffd23f', 'center', '600');
      ctx.globalAlpha = 1;
      ty -= 24;
    }

    // Controls hint, bottom-left.
    text('WASD move/drive · Mouse aim · Click shoot · E enter car · R reload · M jobs · P pause', 16, VIEW_H - 14, 13, 'rgba(255,255,255,0.6)', 'left');

    drawMinimap(state, state.markerForMap);
  }

  function drawTitleScreen(state, best) {
    drawWorld(state, null, 0);
    ctx.fillStyle = 'rgba(8, 12, 24, 0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('NEON HARBOR', VIEW_W / 2, 190, 84, '#ffd23f', 'center', '800');
    text('An open-world crime story in the sun', VIEW_W / 2, 236, 24, PALETTE.hudText, 'center');
    const lines = [
      'Explore the city on foot or behind the wheel.',
      'Steal cars, dodge the Harbor PD, and run jobs for Rosa.',
      'Five missions. One city. Make it yours.',
    ];
    lines.forEach((line, i) => text(line, VIEW_W / 2, 300 + i * 30, 19, 'rgba(255,255,255,0.85)', 'center'));
    panel(VIEW_W / 2 - 300, 430, 600, 130, 0.8);
    text('WASD — move / drive      Mouse — aim      Click — shoot', VIEW_W / 2, 468, 17, PALETTE.hudText, 'center');
    text('E — enter / exit car      R — reload      M — jobs      P — pause', VIEW_W / 2, 496, 17, PALETTE.hudText, 'center');
    text('Stealing cars and shooting raise your wanted level.', VIEW_W / 2, 524, 17, '#ff9d9d', 'center');
    text('Press SPACE or click to start', VIEW_W / 2, 610, 24, '#ffd23f', 'center', '700');
    if (best && best.money > 0) text(`Best run: $${best.money.toLocaleString('en-US')} · ${best.missions} jobs done`, VIEW_W / 2, 650, 16, 'rgba(255,255,255,0.7)', 'center');
  }

  function drawPausedScreen() {
    ctx.fillStyle = 'rgba(8, 12, 24, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(VIEW_W / 2 - 260, VIEW_H / 2 - 110, 520, 220, 0.85);
    text('PAUSED', VIEW_W / 2, VIEW_H / 2 - 40, 44, PALETTE.hudText, 'center', '800');
    text('The city waits for no one. Except now.', VIEW_W / 2, VIEW_H / 2 + 4, 18, 'rgba(255,255,255,0.8)', 'center');
    text('Press P to resume · M for jobs', VIEW_W / 2, VIEW_H / 2 + 56, 18, '#ffd23f', 'center', '700');
  }

  function drawMissionsScreen(state) {
    ctx.fillStyle = 'rgba(8, 12, 24, 0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(VIEW_W / 2 - 360, 90, 720, 540, 0.9);
    text('JOBS FOR ROSA', VIEW_W / 2, 150, 36, '#ffd23f', 'center', '800');
    MISSIONS.forEach((mission, i) => {
      const y = 200 + i * 62;
      const done = i < state.missionIndex;
      const current = i === state.missionIndex;
      text(missionLabel(mission, done), VIEW_W / 2 - 320, y, 20, current ? '#ffd23f' : done ? '#69f0ae' : PALETTE.hudText, 'left', current ? '700' : '400');
      text(mission.brief, VIEW_W / 2 - 320, y + 24, 15, 'rgba(255,255,255,0.65)', 'left');
      if (current) text('CURRENT', VIEW_W / 2 + 320, y, 15, '#ffd23f', 'right', '700');
    });
    text('Press M or ESC to close', VIEW_W / 2, 600, 18, PALETTE.hudText, 'center');
  }

  function drawOverScreen(state, reason) {
    ctx.fillStyle = 'rgba(8, 12, 24, 0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(VIEW_W / 2 - 300, VIEW_H / 2 - 130, 600, 260, 0.9);
    const title = reason === 'busted' ? 'BUSTED!' : 'WASTED!';
    text(title, VIEW_W / 2, VIEW_H / 2 - 56, 56, reason === 'busted' ? '#2d7dff' : '#ff5252', 'center', '800');
    const lines = reason === 'busted'
      ? ['The Harbor PD hauled you in.', 'You lost half your cash. Rosa is already', 'working on your bail.']
      : ['You wake up at the marina clinic.', 'The doctor kept half your cash as a fee.', 'Rosa says: walk it off, kid.'];
    lines.forEach((line, i) => text(line, VIEW_W / 2, VIEW_H / 2 + 4 + i * 26, 18, PALETTE.hudText, 'center'));
    text('Press SPACE to get back on your feet', VIEW_W / 2, VIEW_H / 2 + 104, 20, '#ffd23f', 'center', '700');
  }

  function drawIntroCard(lines, prompt) {
    ctx.fillStyle = 'rgba(8, 12, 24, 0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    lines.forEach((line, i) => text(line, VIEW_W / 2, VIEW_H / 2 - 60 + i * 34, 22, PALETTE.hudText, 'center'));
    text(prompt, VIEW_W / 2, VIEW_H / 2 + 90, 20, '#ffd23f', 'center', '700');
  }

  /** Paint one frame. `ui` carries the screen, toasts, step text and markers. */
  function draw(state, ui, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    state.markerForMap = ui.marker;
    if (ui.screen === SCREEN_TITLE) {
      drawTitleScreen(state, ui.best);
      return;
    }
    drawWorld(state, ui.marker, time);
    drawHud(state, ui.stepText, ui.toasts, time);
    if (ui.screen === SCREEN_PAUSED) drawPausedScreen();
    else if (ui.screen === SCREEN_MISSIONS) drawMissionsScreen(state);
    else if (ui.screen === SCREEN_OVER) drawOverScreen(state, ui.overReason);
    else if (ui.screen === 'intro') drawIntroCard(STORY_INTRO, 'Press SPACE to begin');
    else if (ui.screen === 'outro') drawIntroCard(STORY_OUTRO, 'Press SPACE to keep roaming Neon Harbor');
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}

// Sky Courier — Alpine Rings: the renderer. A chase view: the camera sits behind the
// plane and looks forward over a projected heightfield, with the plane drawn in frame,
// rings and balloons ahead, and a lit HUD. Everything is drawn with the 2D canvas;
// there are no images and no network requests.

import { FIELD, PALETTE } from './config.js';
import { clamp, lerp } from './random.js';
import { nextRing, scoreOf, terrainHeight } from './world.js';

const FOCAL = (FIELD.height / 2) / Math.tan((72 * Math.PI) / 360);
const NEAR = 6;
const FAR = 1500;

/** Parse a '#rrggbb' hex colour or an 'rgb(r,g,b)' string into [r, g, b]. */
function parseColour(c) {
  if (c.startsWith('#')) {
    const v = parseInt(c.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

/** Mix two colours (hex or rgb() strings) by t in [0, 1]. */
function mix(colA, colB, t) {
  const a = parseColour(colA);
  const b = parseColour(colB);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r},${g},${bl})`;
}

/** Terrain colour by height, before fog. */
function terrainColour(h, seed) {
  if (h > 120) return PALETTE.terrainSnow;
  if (h > 78) return PALETTE.terrainHigh;
  if (h > 34) return mix(PALETTE.terrainMid, PALETTE.terrainHigh, (h - 34) / 44);
  return mix(PALETTE.terrainLow, PALETTE.terrainMid, clamp(h / 34, 0, 1));
}

/**
 * Build the camera for a frame. The camera trails the plane by 26 m, 7 m up, and
 * looks 60 m ahead of it, pitched with half the plane's pitch so climbs feel real.
 */
function cameraFor(world) {
  const p = world.plane;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const cam = {
    x: p.x - fx * 26,
    y: p.y + 7,
    z: p.z - fz * 26,
    heading: p.heading,
    pitch: p.pitch * 0.5,
  };
  return cam;
}

/**
 * Project a world point into screen space. Returns null behind the near plane.
 * rel.z is the forward depth, used for painter's ordering and fog.
 */
function project(cam, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const sh = Math.sin(cam.heading);
  const ch = Math.cos(cam.heading);
  // Right, up, forward in world space (heading rotates around Y).
  const rx = dx * ch - dz * sh;
  const rz = dx * sh + dz * ch;
  // Apply the camera pitch (rotate around the right axis).
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const ry = dy * cp - rz * sp;
  const fz = dy * sp + rz * cp;
  if (fz < NEAR) return null;
  const s = FOCAL / fz;
  return {
    x: FIELD.width / 2 + rx * s,
    y: FIELD.height / 2 - ry * s,
    z: fz,
    s,
  };
}

function drawSky(ctx, world) {
  const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(0.78, PALETTE.horizon);
  g.addColorStop(1, PALETTE.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  // Sun, upper right.
  const sunX = FIELD.width * 0.78;
  const sunY = FIELD.height * 0.16;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  glow.addColorStop(0, 'rgba(255,243,196,0.95)');
  glow.addColorStop(0.25, 'rgba(255,243,196,0.55)');
  glow.addColorStop(1, 'rgba(255,243,196,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
  ctx.fillStyle = PALETTE.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
}

function drawTerrain(ctx, world, cam) {
  const seed = world.seed;
  const stepZ = 46;
  const stepX = 70;
  const startZ = Math.floor((cam.z + 30) / stepZ) * stepZ;
  const rows = Math.ceil(FAR / stepZ);
  const cols = Math.ceil(1500 / stepX);
  const startX = Math.floor((cam.x - 750) / stepX) * stepX;
  // Far rows first, so near terrain paints over far terrain.
  for (let r = rows - 1; r >= 0; r--) {
    const z0 = startZ + r * stepZ;
    const z1 = z0 + stepZ;
    for (let c = 0; c < cols; c++) {
      const x0 = startX + c * stepX;
      const x1 = x0 + stepX;
      const h00 = terrainHeight(x0, z0, seed);
      const h10 = terrainHeight(x1, z0, seed);
      const h01 = terrainHeight(x0, z1, seed);
      const h11 = terrainHeight(x1, z1, seed);
      const p00 = project(cam, x0, h00, z0);
      const p10 = project(cam, x1, h10, z0);
      const p01 = project(cam, x0, h01, z1);
      const p11 = project(cam, x1, h11, z1);
      if (!p00 || !p10 || !p01 || !p11) continue;
      const midZ = (p00.z + p11.z) / 2;
      const fog = clamp((midZ - 350) / (FAR - 350), 0, 0.85);
      const hAvg = (h00 + h10 + h01 + h11) / 4;
      // Simple slope shading: a cell falling away from the camera is a touch
      // darker, one rising toward it a touch lighter. Kept subtle: strong
      // shading turned the whole valley black in the first screenshots.
      const slope = clamp((h00 + h10 - h01 - h11) / 140, -0.12, 0.12);
      let col = terrainColour(hAvg, seed);
      if (slope !== 0) col = mix(col, slope > 0 ? '#ffffff' : '#000000', Math.abs(slope));
      col = mix(col, PALETTE.horizon, fog);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunway(ctx, world, cam) {
  // Grey strip with a dashed centreline, flat on the valley floor.
  for (let z = -60; z < 320; z += 40) {
    const a = project(cam, -20, 0.6, z);
    const b = project(cam, 20, 0.6, z);
    const c = project(cam, 20, 0.6, z + 40);
    const d = project(cam, -20, 0.6, z + 40);
    if (!a || !b || !c || !d) continue;
    const fog = clamp((a.z - 350) / (FAR - 350), 0, 0.85);
    ctx.fillStyle = mix(PALETTE.runway, PALETTE.horizon, fog);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dash every other slab.
    if ((z / 40) % 2 === 0) {
      const m1 = project(cam, -1.5, 0.8, z + 8);
      const m2 = project(cam, 1.5, 0.8, z + 8);
      const m3 = project(cam, 1.5, 0.8, z + 32);
      const m4 = project(cam, -1.5, 0.8, z + 32);
      if (m1 && m2 && m3 && m4) {
        ctx.fillStyle = mix(PALETTE.runwayMark, PALETTE.horizon, fog);
        ctx.beginPath();
        ctx.moveTo(m1.x, m1.y);
        ctx.lineTo(m2.x, m2.y);
        ctx.lineTo(m3.x, m3.y);
        ctx.lineTo(m4.x, m4.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function drawRing(ctx, cam, ring, isNext, time) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const p = project(cam, ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r, ring.z);
    if (!p) return;
    pts.push(p);
  }
  const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 1;
  ctx.save();
  ctx.globalAlpha = isNext ? 0.95 : 0.55;
  ctx.lineWidth = Math.max(2, 7 * pts[0].s * 0.02 * pulse + 2);
  ctx.strokeStyle = isNext ? PALETTE.ringNext : PALETTE.ring;
  ctx.shadowColor = PALETTE.ring;
  ctx.shadowBlur = isNext ? 18 : 6;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawBalloon(ctx, cam, b) {
  const p = project(cam, b.x, b.y, b.z);
  if (!p) return;
  const r = Math.max(2, b.r * p.s);
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
  const top = b.hue === 0 ? '#ff8a75' : '#ffd166';
  const bottom = b.hue === 0 ? '#c0392b' : '#e08a00';
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  // Basket.
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(p.x - r * 0.28, p.y + r * 1.05, r * 0.56, r * 0.42);
  ctx.strokeStyle = 'rgba(60,40,20,0.8)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(p.x - r * 0.6, p.y + r * 0.7);
  ctx.lineTo(p.x - r * 0.28, p.y + r * 1.05);
  ctx.moveTo(p.x + r * 0.6, p.y + r * 0.7);
  ctx.lineTo(p.x + r * 0.28, p.y + r * 1.05);
  ctx.stroke();
}

function drawCloud(ctx, cam, c) {
  const p = project(cam, c.x, c.y, c.z);
  if (!p) return;
  const s = c.s * p.s;
  if (s < 2) return;
  ctx.save();
  ctx.globalAlpha = clamp(0.85 - p.z / 2200, 0.25, 0.85);
  ctx.fillStyle = PALETTE.cloud;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s, s * 0.42, 0, 0, Math.PI * 2);
  ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.62, s * 0.3, 0, 0, Math.PI * 2);
  ctx.ellipse(p.x + s * 0.55, p.y + s * 0.08, s * 0.62, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The plane's soft shadow on the ground below it. */
function drawPlaneShadow(ctx, world, cam) {
  const p = world.plane;
  const ground = terrainHeight(p.x, p.z, world.seed);
  const s = project(cam, p.x, ground + 0.8, p.z);
  if (!s) return;
  const r = clamp(46 * s.s * 0.12, 3, 60);
  ctx.save();
  ctx.globalAlpha = clamp(0.35 - (p.y - ground) / 600, 0.06, 0.35);
  ctx.fillStyle = '#0a1a26';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, r, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The courier plane, seen from behind and slightly above, banking with the roll. */
function drawPlane(ctx, world, time) {
  const p = world.plane;
  const cx = FIELD.width / 2;
  const cy = FIELD.height / 2 + 148;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.roll * 0.85);
  // Soft shadow under the sprite for depth.
  ctx.fillStyle = 'rgba(10,20,30,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 46, 92, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Main wings.
  ctx.fillStyle = '#e8543f';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.lineTo(-16, -8);
  ctx.lineTo(16, -8);
  ctx.lineTo(118, 6);
  ctx.lineTo(104, 18);
  ctx.lineTo(0, 12);
  ctx.lineTo(-104, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-14, -8, 28, 20);
  // Fuselage: tapering away from the viewer.
  const fus = ctx.createLinearGradient(0, 44, 0, -64);
  fus.addColorStop(0, '#f6f9fc');
  fus.addColorStop(0.6, '#dbe7f0');
  fus.addColorStop(1, '#9fb6c8');
  ctx.fillStyle = fus;
  ctx.beginPath();
  ctx.moveTo(-16, 44);
  ctx.lineTo(-11, -30);
  ctx.quadraticCurveTo(0, -66, 11, -30);
  ctx.lineTo(16, 44);
  ctx.quadraticCurveTo(0, 54, -16, 44);
  ctx.closePath();
  ctx.fill();
  // Tail fin and stabiliser.
  ctx.fillStyle = '#e8543f';
  ctx.beginPath();
  ctx.moveTo(-4, 42);
  ctx.lineTo(-4, 8);
  ctx.lineTo(-16, -2);
  ctx.lineTo(4, 6);
  ctx.lineTo(4, 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9402f';
  ctx.beginPath();
  ctx.moveTo(-34, 34);
  ctx.lineTo(34, 34);
  ctx.lineTo(26, 44);
  ctx.lineTo(-26, 44);
  ctx.closePath();
  ctx.fill();
  // Cockpit window.
  ctx.fillStyle = '#1d4e6e';
  ctx.beginPath();
  ctx.ellipse(0, -18, 8, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-2, -22, 3, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Propeller blur at the nose (faint, spinning).
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#5a6b7a';
  ctx.beginPath();
  ctx.ellipse(0, -58, 5 + 3 * Math.sin(time * 40), 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Engine glow, stronger with throttle.
  const glow = 0.25 + p.throttle * 0.5;
  ctx.save();
  ctx.globalAlpha = glow;
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.ellipse(0, 48, 7, 5 + 4 * Math.sin(time * 31), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function compassLabel(headingDeg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((headingDeg % 360) + 360) % 360) / 45) % 8;
  return points[idx];
}

function drawHud(ctx, world) {
  const p = world.plane;
  const headingDeg = (((p.heading * 180) / Math.PI) % 360 + 360) % 360;
  ctx.save();
  ctx.font = '600 15px ' + "'system-ui', sans-serif";
  ctx.textBaseline = 'middle';

  // Top-left instrument cluster: speed, altitude, vertical speed.
  panel(ctx, 16, 14, 250, 96);
  hudRow(ctx, 30, 34, 'SPEED', `${Math.round(p.speed * 1.94384)} kt`);
  hudRow(ctx, 30, 60, 'ALT', `${Math.round(p.y)} m`);
  hudRow(ctx, 30, 86, 'V/S', `${p.vy >= 0 ? '+' : ''}${Math.round(p.vy)} m/s`, p.vy < -12 ? PALETTE.hudWarn : PALETTE.hudText);

  // Top-centre compass.
  panel(ctx, FIELD.width / 2 - 130, 14, 260, 52);
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = '700 20px ' + "'system-ui', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}° ${compassLabel(headingDeg)}`, FIELD.width / 2, 32);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px ' + "'system-ui', sans-serif";
  ctx.fillText('HDG', FIELD.width / 2, 54);
  ctx.textAlign = 'left';

  // Top-right: score, rings, combo, time.
  panel(ctx, FIELD.width - 266, 14, 250, 96);
  hudRow(ctx, FIELD.width - 252, 34, 'SCORE', `${scoreOf(world)}`);
  hudRow(ctx, FIELD.width - 252, 60, 'RINGS', `${world.ringsHit} / ${world.rings.length}`);
  const mm = Math.floor(world.timeLeft / 60);
  const ss = String(Math.floor(world.timeLeft % 60)).padStart(2, '0');
  hudRow(ctx, FIELD.width - 252, 86, 'TIME', `${mm}:${ss}`, world.timeLeft < 30 ? PALETTE.hudWarn : PALETTE.hudText);
  if (world.combo >= 2) {
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = '700 15px ' + "'system-ui', sans-serif";
    ctx.fillText(`COMBO x${world.combo}`, FIELD.width - 252, 108);
  }

  // Bottom-left: throttle bar.
  panel(ctx, 16, FIELD.height - 66, 210, 50);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px ' + "'system-ui', sans-serif";
  ctx.fillText('THR', 30, FIELD.height - 41);
  ctx.fillStyle = '#22303f';
  ctx.fillRect(72, FIELD.height - 50, 140, 14);
  ctx.fillStyle = p.throttle > 0.85 ? PALETTE.hudWarn : PALETTE.hudAccent;
  ctx.fillRect(72, FIELD.height - 50, 140 * p.throttle, 14);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '12px ' + "'system-ui', sans-serif";
  ctx.fillText(`${Math.round(p.throttle * 100)}%`, 72, FIELD.height - 26);

  // Bottom-right: artificial horizon.
  const hx = FIELD.width - 72;
  const hy = FIELD.height - 72;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, 40, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2f6fb4';
  ctx.fillRect(hx - 40, hy - 40, 80, 80);
  ctx.translate(hx, hy);
  // The horizon bar rotates opposite to the bank: banking right tips the
  // world counterclockwise from the pilot's seat.
  ctx.rotate(-p.roll);
  ctx.translate(0, clamp(p.pitch * 60, -40, 40));
  ctx.fillStyle = '#5d9b4a';
  ctx.fillRect(-60, 0, 120, 60);
  ctx.fillStyle = '#eef6ff';
  ctx.fillRect(-60, -1, 120, 2);
  ctx.restore();
  ctx.strokeStyle = PALETTE.hudText;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy, 40, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker.
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.fillRect(hx - 4, hy - 3, 8, 6);

  // Centre flash message.
  if (world.message && world.time - world.messageAt < 1.6) {
    ctx.save();
    ctx.globalAlpha = clamp(1.6 - (world.time - world.messageAt), 0, 1);
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = '700 30px ' + "'system-ui', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(world.message, FIELD.width / 2, FIELD.height * 0.3);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // Next-ring pointer: when the next ring is off-screen, point at it.
  const ring = nextRing(world);
  if (ring && world.state === 'flying') {
    const cam = cameraFor(world);
    const rp = project(cam, ring.x, ring.y, ring.z);
    let px;
    let py;
    if (rp) {
      px = clamp(rp.x, 60, FIELD.width - 60);
      py = clamp(rp.y, 90, FIELD.height - 120);
    } else {
      // Behind the camera: point by heading difference.
      const dx = ring.x - p.x;
      const dz = ring.z - p.z;
      const ang = Math.atan2(dx, dz) - p.heading;
      px = FIELD.width / 2 + Math.sin(ang) * 220;
      py = FIELD.height / 2 - 140;
    }
    if (!rp || rp.x < 40 || rp.x > FIELD.width - 40 || rp.y < 80 || rp.y > FIELD.height - 80) {
      ctx.save();
      ctx.translate(clamp(px, 60, FIELD.width - 60), clamp(py, 90, FIELD.height - 120));
      ctx.fillStyle = PALETTE.ringNext;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = PALETTE.ringNext;
      ctx.font = '700 13px ' + "'system-ui', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('NEXT RING', clamp(px, 60, FIELD.width - 60), clamp(py, 90, FIELD.height - 120) + 26);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.strokeStyle = 'rgba(238,246,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function hudRow(ctx, x, y, label, value, colour) {
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px ' + "'system-ui', sans-serif";
  ctx.fillText(label, x, y);
  ctx.fillStyle = colour || PALETTE.hudText;
  ctx.font = '700 17px ' + "'system-ui', sans-serif";
  ctx.fillText(value, x + 62, y);
}

function drawTitle(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 18, 32, 0.45)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px ' + "'system-ui', sans-serif";
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.fillText('SKY COURIER', FIELD.width / 2, 170);
  ctx.font = '700 30px ' + "'system-ui', sans-serif";
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.fillText('— Alpine Rings —', FIELD.width / 2, 214);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#eef6ff';
  ctx.font = '18px ' + "'system-ui', sans-serif";
  ctx.fillText('Thread the golden rings over the valley. Mind the balloons — and the mountains.', FIELD.width / 2, 258);
  ctx.fillText('Arrows steer · W / S throttle · Mouse steers too · P pause · M mute', FIELD.width / 2, 288);
  const best = Number(localStorage.getItem('sky-courier-alpine-rings.best') || 0);
  if (best > 0) {
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = '700 18px ' + "'system-ui', sans-serif";
    ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 322);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px ' + "'system-ui', sans-serif";
  const blink = 0.65 + 0.35 * Math.sin(world.time * 4);
  ctx.globalAlpha = blink;
  ctx.fillText('Press SPACE to take off', FIELD.width / 2, 380);
  ctx.restore();
}

function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 18, 32, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px ' + "'system-ui', sans-serif";
  ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
  ctx.font = '18px ' + "'system-ui', sans-serif";
  ctx.fillText('P or Esc to resume · R to restart', FIELD.width / 2, FIELD.height / 2 + 28);
  ctx.restore();
}

function drawGameOver(ctx, world) {
  const crashed = world.state === 'crashed';
  ctx.save();
  ctx.fillStyle = 'rgba(8, 18, 32, 0.6)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = crashed ? PALETTE.hudWarn : PALETTE.hudAccent;
  ctx.font = '800 46px ' + "'system-ui', sans-serif";
  ctx.fillText(crashed ? 'CRASHED' : 'FLIGHT COMPLETE', FIELD.width / 2, 220);
  ctx.fillStyle = '#eef6ff';
  ctx.font = '18px ' + "'system-ui', sans-serif";
  if (crashed) ctx.fillText(world.crashReason || '', FIELD.width / 2, 258);
  else ctx.fillText('Three minutes over the valley — the mail got through.', FIELD.width / 2, 258);
  ctx.font = '700 26px ' + "'system-ui', sans-serif";
  ctx.fillText(`Score  ${scoreOf(world)}`, FIELD.width / 2, 320);
  ctx.font = '18px ' + "'system-ui', sans-serif";
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(
    `Rings ${world.ringsHit} / ${world.rings.length}   ·   Best combo x${world.bestCombo}   ·   Distance ${Math.round(world.distance)} m`,
    FIELD.width / 2,
    356,
  );
  const best = Number(localStorage.getItem('sky-courier-alpine-rings.best') || 0);
  if (scoreOf(world) >= best && scoreOf(world) > 0) {
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = '700 20px ' + "'system-ui', sans-serif";
    ctx.fillText('New best score!', FIELD.width / 2, 392);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px ' + "'system-ui', sans-serif";
  const blink = 0.65 + 0.35 * Math.sin(world.time * 4);
  ctx.globalAlpha = blink;
  ctx.fillText('Press SPACE to fly again', FIELD.width / 2, 448);
  ctx.restore();
}

/** Draw one frame. `time` is the wall-clock seconds for pulsing effects. */
export function render(ctx, world, time) {
  const cam = cameraFor(world);
  drawSky(ctx, world);
  drawTerrain(ctx, world, cam);
  drawRunway(ctx, world, cam);
  // Clouds behind the rings and balloons, far to near.
  const sorted = [...world.clouds].sort((a, b) => b.z - a.z);
  for (const c of sorted) drawCloud(ctx, cam, c);
  for (const b of world.balloons) drawBalloon(ctx, cam, b);
  for (let i = world.rings.length - 1; i >= 0; i--) {
    const ring = world.rings[i];
    if (ring.passed || ring.missed) continue;
    drawRing(ctx, cam, ring, i === world.nextRing, time);
  }
  drawPlaneShadow(ctx, world, cam);
  drawPlane(ctx, world, time);
  if (world.state === 'flying' || world.state === 'paused') drawHud(ctx, world);
  if (world.state === 'title') drawTitle(ctx, world);
  if (world.state === 'paused') drawPaused(ctx);
  if (world.state === 'crashed' || world.state === 'finished') drawGameOver(ctx, world);
}

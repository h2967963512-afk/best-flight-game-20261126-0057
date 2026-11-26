// Sky Courier — Alpine Rings: the world and its rules. A seeded alpine valley with a
// runway at the start, a course of golden rings to thread, hot-air balloons drifting
// as hazards, and a small plane with banked-turn flight physics.
//
// Coordinates: x east, y up (altitude, metres), z north (forward along the course).
// The plane starts on the runway at the origin, nose pointing +z.

import { COURSE_LENGTH, FLIGHT_SECONDS, PLANE, RING_RADIUS, RING_SPACING, SCORING } from './config.js';
import { clamp, lerp, mulberry32, noise2 } from './random.js';

/** The runway occupies this strip; the terrain is flattened to sea level inside it. */
const RUNWAY = { x0: -22, x1: 22, z0: -60, z1: 500 };

/** How many rings the course holds. */
export const RING_COUNT = Math.floor(COURSE_LENGTH / RING_SPACING);

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Terrain height at (x, z). Rolling hills from two noise octaves, a mountain ridge
 * that rises as you leave the valley, and a flat pad under the runway.
 */
export function terrainHeight(x, z, seed) {
  const n1 = noise2(x * 0.004, z * 0.004, seed) - 0.5;
  const n2 = noise2(x * 0.016 + 7.3, z * 0.016 + 3.1, seed + 11) - 0.5;
  let h = n1 * 70 + n2 * 22;
  const offValley = Math.max(0, (Math.abs(x) - 240) / 320);
  const ridge = offValley * offValley * 190 * (0.55 + 0.45 * noise2(x * 0.01, z * 0.008, seed + 23));
  h += ridge;
  // Flatten toward the runway pad.
  const dx = Math.max(RUNWAY.x0 - x, 0, x - RUNWAY.x1);
  const dz = Math.max(RUNWAY.z0 - z, 0, z - RUNWAY.z1);
  const d = Math.hypot(dx, dz);
  const flat = 1 - smoothstep(0, 140, d);
  h = lerp(h, 0, flat);
  // Keep the valley floor low along the first stretch of the course, so a fresh
  // takeoff is not an instant mountainside: the hills still close in from the
  // sides, and past z 3000 the full terrain returns.
  if (z < 3000 && Math.abs(x) < 140) {
    const corridor = 1 - smoothstep(60, 140, Math.abs(x)) * smoothstep(2000, 3000, z);
    h = Math.min(h, lerp(60, 30, corridor));
  }
  return Math.max(h, -3);
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const rings = [];
  let rx = 0;
  for (let i = 0; i < RING_COUNT; i++) {
    const z = 620 + i * RING_SPACING;
    // The course wanders gently: each ring steps sideways from the last.
    rx = clamp(rx + (rng() - 0.5) * 150, -230, 230);
    const y = 70 + rng() * 170;
    rings.push({ x: rx, y, z, r: RING_RADIUS, passed: false, missed: false });
  }
  const balloons = [];
  for (let i = 0; i < 16; i++) {
    const z = 1100 + rng() * (COURSE_LENGTH - 1400);
    const x = (rng() - 0.5) * 560;
    const y = 90 + rng() * 200;
    balloons.push({ x, y, z, r: 13 + rng() * 5, hue: rng() < 0.5 ? 0 : 1, drift: (rng() - 0.5) * 2 });
  }
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (rng() - 0.5) * 1500,
      y: 265 + rng() * 90,
      z: 300 + rng() * COURSE_LENGTH,
      s: 26 + rng() * 46,
    });
  }
  return {
    seed,
    time: 0,
    timeLeft: FLIGHT_SECONDS,
    plane: {
      // Already climbing out over the runway end: a fresh takeoff is a flight,
      // not an instant mountainside.
      x: 0, y: 55, z: -40,
      heading: 0, pitch: 0.05, roll: 0,
      speed: 55, throttle: 0.65,
      vx: 0, vy: 0,
    },
    rings,
    balloons,
    clouds,
    nextRing: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    ringsHit: 0,
    distance: 0,
    state: 'title', // title | flying | paused | crashed | finished
    message: null,
    messageAt: 0,
    crashReason: null,
    // The last frame's derived values, for the renderer and HUD.
    hud: { vspeed: 0, ground: 0 },
  };
}

function flash(world, text) {
  world.message = text;
  world.messageAt = world.time;
}

/** Steer input for one fixed step: { steer: -1..1 (left/right), pitch: -1..1 (down/up), throttle: -1..1 }. */
export function stepWorld(world, input, dt) {
  const p = world.plane;
  if (world.state !== 'flying') return;
  world.time += dt;
  world.timeLeft = Math.max(0, FLIGHT_SECONDS - world.time);
  if (world.timeLeft <= 0) {
    world.state = 'finished';
    flash(world, 'Time! Flight complete');
    return;
  }

  // Throttle and speed.
  p.throttle = clamp(p.throttle + input.throttle * PLANE.throttleRate * dt, 0, 1);
  const targetSpeed = PLANE.minSpeed + p.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  p.speed += (targetSpeed - p.speed) * Math.min(1, PLANE.speedEase * dt);

  // Banked turn: roll toward the steering target, heading follows the bank.
  // Positive roll banks right and turns the nose toward +x (screen right).
  const rollTarget = input.steer * PLANE.maxRoll;
  p.roll += (rollTarget - p.roll) * Math.min(1, PLANE.rollEase * dt);
  p.heading += p.roll * PLANE.turnRate * (p.speed / 70) * dt;

  // Pitch toward the stick target; the nose sets the climb.
  const pitchTarget = input.pitch * PLANE.maxPitch;
  p.pitch += (pitchTarget - p.pitch) * Math.min(1, PLANE.pitchEase * dt);

  // Too slow to fly: the plane sags.
  const sag = p.speed < 45 ? (45 - p.speed) * 0.35 : 0;
  const vy = Math.sin(p.pitch) * p.speed - sag;
  const vx = Math.sin(p.heading) * p.speed;
  const vz = Math.cos(p.heading) * p.speed;
  p.vy = vy;
  p.vx = vx;
  p.x += vx * dt;
  p.y += vy * dt;
  p.z += vz * dt;
  world.distance += p.speed * dt;
  world.score += (p.speed * dt * SCORING.distancePer100m) / 100;

  // Thin air above the ceiling: bleed speed and sink.
  if (p.y > PLANE.ceiling) {
    p.y = PLANE.ceiling;
    p.speed = Math.max(PLANE.minSpeed, p.speed - 30 * dt);
    if (world.time - world.messageAt > 2) flash(world, 'Ceiling! Thin air — descend');
  }
  if (p.y < 2) p.y = 2;

  // Ground collision.
  const ground = terrainHeight(p.x, p.z, world.seed);
  world.hud.ground = ground;
  world.hud.vspeed = vy;
  if (p.y <= ground + PLANE.groundClearance) {
    world.state = 'crashed';
    world.crashReason = 'You clipped the mountainside';
    return;
  }

  // Balloon collision.
  for (const b of world.balloons) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const dz = p.z - b.z;
    if (dx * dx + dy * dy + dz * dz < (b.r + 6) * (b.r + 6)) {
      world.state = 'crashed';
      world.crashReason = 'Mid-air collision with a balloon';
      return;
    }
  }

  // Rings: crossing a ring's z-plane scores if the plane is inside the circle.
  while (world.nextRing < world.rings.length) {
    const ring = world.rings[world.nextRing];
    if (p.z < ring.z) break;
    const dx = p.x - ring.x;
    const dy = p.y - ring.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ring.r) {
      ring.passed = true;
      world.ringsHit++;
      world.combo++;
      world.bestCombo = Math.max(world.bestCombo, world.combo);
      const centre = 1 - dist / ring.r;
      const gained = SCORING.ring + Math.round(SCORING.centreBonus * centre) + (world.combo - 1) * SCORING.comboPerRing;
      world.score += gained;
      flash(world, centre > 0.55 ? `Bullseye! +${gained}` : `Ring! +${gained}`);
    } else {
      ring.missed = true;
      world.combo = 0;
      flash(world, 'Ring missed');
    }
    world.nextRing++;
  }

  // Balloons drift slowly sideways.
  for (const b of world.balloons) b.x += b.drift * dt;
}

/** The next ring the pilot should aim for (or null past the course end). */
export function nextRing(world) {
  return world.nextRing < world.rings.length ? world.rings[world.nextRing] : null;
}

/**
 * Autopilot input: steers the plane toward the next ring, used by the title
 * screen's attract mode and by the staged screenshot scenes. It flies the real
 * rules, so a staged shot is a genuine game state.
 */
export function autopilotInput(world) {
  const p = world.plane;
  const ring = nextRing(world);
  if (!ring) return { steer: 0, pitch: 0, throttle: 0 };
  const dx = ring.x - p.x;
  const dz = ring.z - p.z;
  const desiredHeading = Math.atan2(dx, Math.max(dz, 1));
  let dh = desiredHeading - p.heading;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  const steer = clamp(dh * 2.2 - p.roll * 0.6, -1, 1);
  const dy = ring.y - p.y;
  const dist = Math.hypot(dx, dy, dz);
  const desiredPitch = clamp(Math.asin(clamp(dy / Math.max(dist, 1), -1, 1)) * 1.6, -1, 1);
  const pitch = clamp(desiredPitch - p.pitch * 0.8, -1, 1);
  const throttle = p.throttle < 0.72 ? 1 : 0;
  return { steer, pitch, throttle };
}

/** Start a fresh flight from the runway. */
export function startFlight(world) {
  const fresh = createWorld(world.seed);
  Object.assign(world, fresh, { state: 'flying' });
}

/** Whole-number score for the HUD and the results screen. */
export function scoreOf(world) {
  return Math.floor(world.score);
}

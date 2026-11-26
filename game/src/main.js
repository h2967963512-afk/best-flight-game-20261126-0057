// Sky Courier — Alpine Rings: boot and the frame loop. A fixed 1/60 s simulation step
// with an accumulator, so the flight plays the same on any display; the title screen
// flies an autopilot attract mode over the same world the player will fly.

import { BEST_KEY, FIELD, STEP } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { stageShot } from './shots.js';
import { autopilotInput, createWorld, startFlight, stepWorld, scoreOf } from './world.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = FIELD.width * dpr;
  canvas.height = FIELD.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const input = createInput(canvas);
const audio = createAudio();
let world = createWorld(seed);
// The title screen flies this second world on autopilot behind the title card.
let attract = createWorld(seed);
attract.state = 'flying';
attract.plane.throttle = 0.6;
attract.plane.speed = 55;

let lastRingsHit = 0;
let lastState = world.state;
let lastAnnounce = 0;
let wallTime = 0;
let last = performance.now();
let acc = 0;

function saveBest() {
  const best = Number(localStorage.getItem(BEST_KEY) || 0);
  const s = scoreOf(world);
  if (s > best) localStorage.setItem(BEST_KEY, String(s));
}

function announce() {
  const p = world.plane;
  const headingDeg = (((p.heading * 180) / Math.PI) % 360 + 360) % 360;
  statusEl.textContent =
    world.state === 'flying'
      ? `Flying: speed ${Math.round(p.speed * 1.94)} knots, altitude ${Math.round(p.y)} metres, heading ${Math.round(headingDeg)} degrees, score ${scoreOf(world)}, rings ${world.ringsHit} of ${world.rings.length}, ${Math.ceil(world.timeLeft)} seconds left.`
      : world.state === 'crashed'
        ? `Crashed: ${world.crashReason}. Score ${scoreOf(world)}. Press Space to fly again.`
        : world.state === 'finished'
          ? `Flight complete. Score ${scoreOf(world)}, rings ${world.ringsHit} of ${world.rings.length}. Press Space to fly again.`
          : 'Sky Courier, Alpine Rings. Press Space to take off.';
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  wallTime += dt;
  input.poll();

  // Edge-triggered keys.
  if (input.wasPressed(' ', 'Enter')) {
    audio.ensure();
    if (world.state === 'title' || world.state === 'crashed' || world.state === 'finished') {
      startFlight(world);
      audio.click();
      input.clearPressed();
    }
  }
  if (input.wasPressed('p', 'Escape')) {
    if (world.state === 'flying') {
      world.state = 'paused';
      audio.idle();
    } else if (world.state === 'paused') {
      world.state = 'flying';
    }
  }
  if (input.wasPressed('r')) {
    if (world.state !== 'title') {
      startFlight(world);
      audio.click();
    }
  }
  if (input.wasPressed('m')) {
    audio.setMuted(!audio.muted);
  }
  // Clicking the canvas on the title screen also takes off.
  if (input.pointer.active && world.state === 'title') {
    audio.ensure();
    startFlight(world);
    audio.click();
  }

  // Fixed-step simulation.
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    if (world.state === 'flying') {
      stepWorld(world, { steer: input.steer, pitch: input.pitch, throttle: input.throttle }, STEP);
      if (world.ringsHit > lastRingsHit) {
        audio.ring(world.message && world.message.startsWith('Bullseye'));
        lastRingsHit = world.ringsHit;
      }
      if (world.state === 'crashed') {
        audio.crash();
        audio.idle();
        saveBest();
      } else if (world.state === 'finished') {
        audio.idle();
        saveBest();
      } else {
        audio.update(world.plane.throttle, world.plane.speed);
      }
    } else if (world.state === 'title') {
      // Attract mode: the second world flies itself behind the title card.
      stepWorld(attract, autopilotInput(attract), STEP);
      if (attract.state !== 'flying') {
        attract = createWorld(seed);
        attract.state = 'flying';
        attract.plane.throttle = 0.6;
        attract.plane.speed = 55;
      }
    }
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;

  const showing = world.state === 'title' ? attract : world;
  render(ctx, showing, wallTime);

  if (world.state !== lastState) {
    lastState = world.state;
    lastRingsHit = world.ringsHit;
    lastAnnounce = wallTime;
    announce();
  }
  // The status line is the screen-reader HUD: refresh it every second in flight,
  // not only when the state changes, or its numbers go stale mid-flight.
  if (world.state === 'flying' && wallTime - lastAnnounce >= 1) {
    lastAnnounce = wallTime;
    announce();
  }
  requestAnimationFrame(frame);
}

// A staged screenshot scene (?shot=...) plays the real rules forward with the
// autopilot, then freezes the frame for the capture.
if (shot) {
  stageShot(world, shot, seed);
  fitCanvas();
  render(ctx, world, 0);
  announce();
  // Snapshot for the screenshot tool to verify the staged state by its values,
  // not just its pixels.
  window.__skyCourier = {
    shot,
    seed,
    state: world.state,
    score: scoreOf(world),
    ringsHit: world.ringsHit,
    ringsTotal: world.rings.length,
    bestCombo: world.bestCombo,
    distance: Math.round(world.distance),
    altitude: Math.round(world.plane.y),
    speed: Math.round(world.plane.speed),
    timeLeft: Math.round(world.timeLeft),
  };
  // Keep rendering so the page stays alive for the screenshot tool, but freeze
  // the simulation: the staged state is the shot.
} else {
  announce();
  requestAnimationFrame(frame);
}

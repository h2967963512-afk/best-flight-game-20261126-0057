// Sky Courier — Alpine Rings: staged screenshot scenes. Each scene plays the real
// rules forward with the autopilot (the same stepWorld the player runs), then leaves
// the world frozen in a genuine state for the capture. `?shot=<name>&seed=N`.
//
//   start — title screen over the valley, plane on the runway
//   play  — mid-flight, climbing toward the next ring
//   rings — deep in the course, a ring dead ahead with balloons nearby
//   end   — flight complete, results on screen

import { STEP } from './config.js';
import { autopilotInput, createWorld, scoreOf, startFlight, stepWorld } from './world.js';

/** Step the autopilot forward `seconds` of game time. */
function flyFor(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    if (world.state !== 'flying') break;
    stepWorld(world, autopilotInput(world), STEP);
  }
}

export function stageShot(world, name, seed) {
  if (name === 'start') {
    // Title screen: plane climbing out over the runway, valley and first ring ahead.
    const fresh = createWorld(seed);
    Object.assign(world, fresh, { state: 'title' });
    world.time = 0;
    return;
  }
  if (name === 'play') {
    startFlight(world);
    flyFor(world, 14);
    // Leave the state 'flying': the shot is a live flight frame with the HUD.
    // (Pausing would paint the PAUSED overlay over the scene.)
    world.message = null;
    return;
  }
  if (name === 'rings') {
    startFlight(world);
    flyFor(world, 46);
    world.message = null;
    return;
  }
  if (name === 'end') {
    startFlight(world);
    flyFor(world, 185);
    if (world.state === 'flying') world.state = 'finished';
    // If the autopilot crashed instead, the crash screen is the honest result:
    // never invent a score for the shot.
    return;
  }
  // Unknown scene: fall back to the title.
  const fresh = createWorld(seed);
  Object.assign(world, fresh, { state: 'title' });
}

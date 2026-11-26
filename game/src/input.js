// Sky Courier — Alpine Rings: keyboard and mouse input. Arrows (or A/D) bank the plane,
// Up/Down pitch it, W/S work the throttle, and holding the mouse button steers toward
// the pointer like a virtual stick. Space starts, P/Esc pauses, R restarts, M mutes.

import { FIELD } from './config.js';
import { clamp } from './random.js';

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    /** -1 (left) .. 1 (right). */
    steer: 0,
    /** -1 (down) .. 1 (up). */
    pitch: 0,
    /** -1 .. 1, throttle lever direction. */
    throttle: 0,
    muted: false,
    /** The pointer's offset from screen centre while the mouse is held, -1..1. */
    pointer: { x: 0, y: 0, active: false },
    pressed: new Set(),
  };

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (!e.repeat) input.pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = FIELD.width / rect.width;
    const scaleY = FIELD.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX - FIELD.width / 2) / (FIELD.width / 2),
      y: ((e.clientY - rect.top) * scaleY - FIELD.height / 2) / (FIELD.height / 2),
    };
  }
  canvas.addEventListener('pointerdown', (e) => {
    input.pointer.active = true;
    const p = pointerPos(e);
    input.pointer.x = clamp(p.x, -1, 1);
    input.pointer.y = clamp(p.y, -1, 1);
  });
  window.addEventListener('pointermove', (e) => {
    if (!input.pointer.active) return;
    const p = pointerPos(e);
    input.pointer.x = clamp(p.x, -1, 1);
    input.pointer.y = clamp(p.y, -1, 1);
  });
  window.addEventListener('pointerup', () => {
    input.pointer.active = false;
    input.pointer.x = 0;
    input.pointer.y = 0;
  });

  /** Recompute the held axes from the current keys and pointer. Call once per frame. */
  input.poll = function poll() {
    // Arrows (or A/D) bank and pitch; W/S work the throttle lever.
    let steer = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) steer -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) steer += 1;
    let pitch = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    let throttle = 0;
    if (keys.has('w')) throttle += 1;
    if (keys.has('s')) throttle -= 1;
    // A held pointer steers like a virtual stick and owns pitch and roll.
    if (input.pointer.active) {
      steer = clamp(input.pointer.x * 1.4, -1, 1);
      pitch = clamp(-input.pointer.y * 1.4, -1, 1);
    }
    input.steer = steer;
    input.pitch = pitch;
    input.throttle = throttle;
  };

  /** True once for a key pressed since the last call (edge-triggered actions). */
  input.wasPressed = function wasPressed(...names) {
    for (const n of names) {
      if (input.pressed.has(n)) {
        input.pressed.delete(n);
        return true;
      }
    }
    return false;
  };

  input.clearPressed = function clearPressed() {
    input.pressed.clear();
  };

  return input;
}

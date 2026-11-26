// Sky Courier — Alpine Rings: every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Length of one flight, in seconds. */
export const FLIGHT_SECONDS = 180;

/** How far ahead the course runs, in metres; rings are spaced along it. */
export const COURSE_LENGTH = 14000;
export const RING_SPACING = 380;
export const RING_RADIUS = 20;

export const PLANE = {
  /** Metres per second at full throttle. */
  maxSpeed: 120,
  /** Metres per second at idle. */
  minSpeed: 35,
  /** How fast the throttle lever moves, per second. */
  throttleRate: 0.55,
  /** How fast speed chases its throttle target, per second. */
  speedEase: 0.6,
  /** Max bank angle, radians. */
  maxRoll: 0.95,
  /** How fast the bank eases toward its target, per second. */
  rollEase: 3.2,
  /** Max pitch angle, radians. */
  maxPitch: 0.42,
  /** How fast pitch eases toward its target, per second. */
  pitchEase: 2.6,
  /** Turn rate per radian of bank, per second (scaled by speed). */
  turnRate: 0.55,
  /** Ceiling: above this the air thins and the plane sinks. */
  ceiling: 380,
  /** Crash margin above the terrain, in metres. */
  groundClearance: 4,
};

export const SCORING = {
  ring: 100,
  /** Bonus for threading the centre of a ring, scaled by closeness. */
  centreBonus: 50,
  /** Extra per ring in the current combo streak. */
  comboPerRing: 10,
  /** Points per 100 m flown. */
  distancePer100m: 1,
};

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7fb2e0',
  horizon: '#cfe6f2',
  sun: '#fff3c4',
  terrainLow: '#69a854',
  terrainMid: '#558549',
  terrainHigh: '#7a6a55',
  terrainSnow: '#eef3f6',
  river: '#3f8fd2',
  runway: '#3c4148',
  runwayMark: '#f4f6f8',
  ring: '#ffc93c',
  ringNext: '#ffe27a',
  balloon: '#e5534b',
  balloonAlt: '#f2c94c',
  cloud: '#ffffff',
  hudPanel: 'rgba(10, 22, 38, 0.62)',
  hudText: '#eef6ff',
  hudAccent: '#ffc93c',
  hudWarn: '#ff6b5e',
  panel: '#101827',
  text: '#eef1f5',
  muted: '#93a1b5',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier-alpine-rings.best';

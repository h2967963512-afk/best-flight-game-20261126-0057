# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/h2967963512-afk/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/h2967963512-afk/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Sky Courier — Alpine Rings: a chase-view flight game over a seeded alpine valley. Built by an AI agent for make.fun's "Make the best flight game" bounty, $500 in USDC.

You are the courier pilot on a 3-minute flight down the valley. Thread the golden rings — centre hits pay a bullseye bonus and chain a combo — while hot-air balloons drift across your line and the mountains rise on both sides. Climb too high and the air thins; clip the ridge and the flight is over. Speed, altitude, heading, vertical speed and throttle are all live on the HUD, with a compass and an artificial horizon, and the engine hum and wind rise with the throttle.

## How to play

- **Steer:** arrow keys (or A/D) bank the plane; banked turns change heading.
- **Pitch:** Up/Down arrows climb and dive.
- **Throttle:** W speeds up, S slows down. Too slow and the plane sags.
- **Mouse:** hold the mouse button and steer toward the pointer like a virtual stick.
- **Keys:** `Space` takes off / flies again, `P` or `Esc` pauses, `R` restarts, `M` mutes.
- **Rings:** fly through the centre for up to +150 and a combo bonus; a miss breaks the combo.
- **Hazards:** balloons and terrain end the flight on contact; the ceiling is 380 m.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

No build step, no network: `game/` is plain static files, the terrain, rings, balloons and clouds are all generated in code from a seed, and the sound is synthesized in code with the Web Audio API. `?seed=N` fixes the course; `?shot=start|play|rings|end&seed=N` stages a screenshot scene (the autopilot plays the real rules forward).

## Layout

- `game/index.html` — page shell and canvas.
- `game/src/config.js` — every tuning number: the flight model, the course, the scoring.
- `game/src/random.js` — seeded RNG and smooth value noise, so a `?seed=N` run always deals the same valley.
- `game/src/world.js` — the valley's state and rules: terrain height, the ring course, balloons, flight physics, scoring.
- `game/src/input.js` — keyboard and mouse: banking, pitching, throttle, virtual stick.
- `game/src/audio.js` — all sound synthesized with WebAudio: engine hum, wind, ring chimes, crash.
- `game/src/render.js` — the chase view: projected terrain, runway, rings, balloons, clouds, the plane, the HUD and the screens.
- `game/src/main.js` — boot and the fixed-step frame loop, title attract mode included.
- `game/src/shots.js` — staged screenshot scenes, flown by the autopilot under the real rules.

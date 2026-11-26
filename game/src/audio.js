// Sky Courier — Alpine Rings: every sound is synthesized with the Web Audio API.
// An engine hum that follows the throttle, wind that rises with speed, a two-note
// chime for a ring, a low thud for a crash, and a click for the UI.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    windFilter: null,
    muted: false,
    started: false,
  };

  /** Build the graph on the first user gesture (browsers require one). */
  audio.ensure = function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(ctx.destination);

    // Engine: a sawtooth through a lowpass, pitched by the throttle.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 70;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();

    // Wind: looped noise through a bandpass, louder and brighter with speed.
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    audio.windSrc = ctx.createBufferSource();
    audio.windSrc.buffer = buf;
    audio.windSrc.loop = true;
    audio.windFilter = ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 500;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0;
    audio.windSrc.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    audio.windSrc.start();
    audio.started = true;
  };

  /** Call every frame while flying: throttle 0..1, speed in m/s. */
  audio.update = function update(throttle, speed) {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    audio.engineOsc.frequency.setTargetAtTime(55 + throttle * 75 + speed * 0.25, t, 0.1);
    audio.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.05, t, 0.1);
    audio.windGain.gain.setTargetAtTime(Math.min(0.12, Math.max(0, (speed - 30) / 700)), t, 0.15);
    audio.windFilter.frequency.setTargetAtTime(380 + speed * 6, t, 0.15);
  };

  audio.idle = function idle() {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    audio.engineGain.gain.setTargetAtTime(0, t, 0.1);
    audio.windGain.gain.setTargetAtTime(0, t, 0.1);
  };

  function tone(freq, dur, type, vol, when = 0) {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime + when;
    const osc = audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  audio.ring = function ring(centre) {
    tone(880, 0.16, 'sine', 0.22);
    tone(1318, 0.3, 'sine', 0.2, 0.07);
    if (centre) tone(1760, 0.3, 'sine', 0.14, 0.14);
  };

  audio.crash = function crash() {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(g);
    g.connect(audio.master);
    osc.start(t);
    osc.stop(t + 0.65);
    tone(220, 0.2, 'square', 0.12);
  };

  audio.click = function click() {
    tone(660, 0.07, 'sine', 0.14);
  };

  audio.setMuted = function setMuted(m) {
    audio.muted = m;
    if (audio.master) audio.master.gain.value = m ? 0 : 0.5;
  };

  return audio;
}

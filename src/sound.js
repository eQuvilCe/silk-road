// All sound is made in the browser with Web Audio — no files to download:
// desert wind with slow gusts, camel bells that ring in step while the caravan walks,
// and fireworks (a rising whistle, then a crack). Off by default; one button turns it on.
let ctx = null;
let master = null;
let windGain = null;
let windFilter = null;
let on = false;
let motion = 0;
let nextBell = 0;
let noiseBuf = null;

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function start() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // wind: looping noise through a wandering band-pass filter
  const src = ctx.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  windFilter.Q.value = 0.8;
  windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  src.connect(windFilter).connect(windGain).connect(master);
  src.start();
}

// one bell strike: inharmonic partials with a long ring, like a cast bronze bell
function bell(volume) {
  const t = ctx.currentTime;
  const f = PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.3 ? 0.5 : 1);
  for (const [ratio, amp, dec] of [[1, 1, 1.6], [2.76, 0.45, 0.9], [5.4, 0.25, 0.5], [8.93, 0.12, 0.3]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f * ratio;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume * amp * 0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dec + 0.05);
  }
}

export const sfx = {
  get on() {
    return on;
  },
  toggle() {
    start();
    on = !on;
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ctx.currentTime + 0.6);
    try {
      localStorage.setItem('silk-sound', on ? '1' : '0');
    } catch {}
    return on;
  },
  // called every frame: how fast the caravan moves (0..1), how deep into the night, and time
  tick(speed, time) {
    if (!on || !ctx) return;
    motion += (speed - motion) * 0.05;
    const t = ctx.currentTime;
    // gusts: slow drifting filter and level
    windFilter.frequency.setTargetAtTime(380 + Math.sin(time * 0.13) * 160 + Math.sin(time * 0.41) * 90 + motion * 300, t, 0.4);
    windGain.gain.setTargetAtTime(0.035 + (Math.sin(time * 0.21) * 0.5 + 0.5) * 0.04 + motion * 0.03, t, 0.5);
    // bells ring in step while the caravan walks
    if (motion > 0.05 && time > nextBell) {
      bell(0.4 + motion * 0.6);
      nextBell = time + (0.9 - motion * 0.45) * (0.8 + Math.random() * 0.4);
    }
  },
  // a firework rocket going up
  launch() {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.1);
    g.gain.linearRampToValueAtTime(0, t + 0.95);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 1);
  },
  // the burst: a low thump and a crackle of noise
  pop(size = 1) {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * size, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + 0.85);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    og.gain.setValueAtTime(0.2 * size, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.55);
  },
};
window.__sfx = sfx;

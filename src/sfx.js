// Sound table + player. One row per game event, so every event can have its own voice.
// A row is either a sample (file, with varispeed `rate`) or a small synthesised cue (tones / noise).
// All numbers here were set by measurement and reasoning, not by ear — this is the place to tune them.

const A = import.meta.env.BASE_URL + "audio/"; // the live build is served under /trinity/
const FILES = {
  action: A + "action.mp3", play: A + "play.mp3", select: A + "select.mp3",
  revenance: A + "revenance.mp3", positive: A + "positive.mp3", negative: A + "negative.mp3",
  diffuse: A + "trap-diffuse.mp3",
  "battle-s": A + "battle-s.mp3", "battle-m": A + "battle-m.mp3", "battle-w": A + "battle-w.mp3",
  "draw-1": A + "draw-1.mp3", "draw-2": A + "draw-2.mp3",
  summon: A + "summon.mp3", rune: A + "rune.mp3", debuff: A + "debuff.mp3",
  "defeat-1": A + "defeat-1.mp3", "defeat-2": A + "defeat-2.mp3", victory: A + "victory.mp3",
};
const DRAWS = ["draw-1", "draw-2"];
const DEFEATS = ["defeat-1", "defeat-2"];
// Per-file trim so the samples sit at about the same loudness. Measured with ffmpeg ebur128: the loud files
// run -8 to -12 LUFS against -16 for select and -23 for the draws; these gains bring the loud ones to about -14.
const GAIN = {
  action: 0.58, play: 0.71, positive: 0.62, negative: 0.8, diffuse: 0.51,
  "battle-s": 0.53, "battle-m": 0.79, "battle-w": 0.56,
  "draw-1": 1.6, "draw-2": 1.6, // already quiet — held where they were when the master level came down
  summon: 0.93, rune: 1.48, debuff: 1.57, "defeat-1": 0.78, "defeat-2": 0.63, victory: 0.65, // same -14 target
};

export const SOUNDS = {
  // samples as they always were
  action: { file: "action" }, summon: { file: "summon" },
  field: { file: "rune" }, defeat: { file: DEFEATS },
  // winning by Enlightenment (+C) and by Oblivion (-C)
  "victory-light": { file: "victory" }, "victory-dark": { file: "debuff" },
  judgment: { file: "play" }, pack: { file: "play" }, select: { file: "select" },
  revenance: { file: "revenance" }, "revenance-pos": { file: "positive" }, "revenance-neg": { file: "negative" },
  diffuse: { file: "diffuse" },
  "battle-s": { file: "battle-s" }, "battle-m": { file: "battle-m" }, "battle-w": { file: "battle-w" },
  draw: { file: DRAWS },
  // a blessing is the action sample pitched up; a curse has its own sample
  "spell-bless": { file: "action", rate: 1.14 },
  "spell-curse": { file: "debuff" },
  // card handling: the draw samples at other speeds
  set: { file: DRAWS, rate: 0.72 },
  flip: { file: DRAWS, rate: 1.28, tones: [{ f0: 520, f1: 780, dur: 0.12, vol: 0.05, at: 0.03 }] },
  // synthesised cues
  move: { noise: { f0: 500, f1: 1500, dur: 0.16, vol: 0.09 } },
  equip: { tones: [{ f0: 660, dur: 0.16, vol: 0.07 }, { f0: 990, dur: 0.22, vol: 0.06, at: 0.07 }] },
  presence: { tones: [{ f0: 440, dur: 0.3, vol: 0.07 }, { f0: 660, dur: 0.4, vol: 0.05, at: 0.05 }] },
  cue: { tones: [{ f0: 360, f1: 300, dur: 0.07, vol: 0.06, type: "triangle" }] },
  "turn-you": { tones: [{ f0: 523, dur: 0.28, vol: 0.08 }, { f0: 784, dur: 0.5, vol: 0.08, at: 0.12 }] },
  "turn-opp": { tones: [{ f0: 196, dur: 0.5, vol: 0.1 }, { f0: 147, dur: 0.6, vol: 0.08, at: 0.14 }] },
};

const SAMPLE_VOL = 0.25; // master level for samples
const JITTER = 0.03;    // total random spread on pitch, so a repeated sound is never identical

let ctx = null;
function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(ac, { f0, f1, dur, vol, at = 0, type = "sine" }, k) {
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0 * k, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1 * k, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}

// Band-passed noise sweep — a short air movement
function noise(ac, { f0, f1, dur, vol }, k) {
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const t = ac.currentTime, src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; bp.type = "bandpass"; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(f0 * k, t); bp.frequency.exponentialRampToValueAtTime(f1 * k, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(ac.destination); src.start(t);
}

let lastPick = null;
export function playSound(type) {
  const s = SOUNDS[type];
  if (!s) return;
  const k = (1 + (Math.random() - 0.5) * JITTER);
  if (s.file) {
    // A sound with several takes never plays the same take twice running
    let name = s.file;
    if (Array.isArray(name)) { const pool = name.filter(f => f !== lastPick); name = pool[Math.floor(Math.random() * pool.length)]; lastPick = name; }
    const a = new Audio(FILES[name]);
    a.preservesPitch = false; a.webkitPreservesPitch = false;
    a.playbackRate = (s.rate || 1) * k;
    a.volume = Math.min(1, SAMPLE_VOL * (GAIN[name] ?? 1) * (s.vol ?? 1) * (0.9 + Math.random() * 0.1));
    a.play().catch(() => { });
  }
  if (s.tones || s.noise) {
    const ac = audioCtx();
    if (!ac) return;
    (s.tones || []).forEach(tn => tone(ac, tn, k));
    if (s.noise) noise(ac, s.noise, k);
  }
}

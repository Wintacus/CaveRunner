/**
 * Audio.
 *
 * Every sound is synthesised through the Web Audio API rather than loaded, which keeps
 * the build dependency-free and licence-free. They are deliberately short, bright and
 * distinguishable from each other; the jump pair especially is kept quiet and slightly
 * pitch-randomised, because it plays dozens of times per run and identical repeats get
 * fatiguing fast.
 *
 * ASSET SWAP POINT — to move to sampled SFX (Pixabay / OpenGameArt / itch packs), load
 * them in PreloadScene and replace the body of `play()` with `this.scene.sound.play(name)`.
 * Everything else (unlock flow, suspend/resume, call sites) stays as-is.
 *
 * Mobile unlock: browsers and WebViews refuse to start an AudioContext outside a user
 * gesture, so `unlock()` is called from inside the Start screen's tap handler — the first
 * guaranteed gesture in the session.
 *
 * LEVELS. The gains below are not free-floating; they are a ladder, and the rule is that
 * RARITY EARNS LOUDNESS. `step` fires 91 times a run and `crystal` 148, so they sit at the
 * bottom; `win` and `powerup` fire once each and sit at the top. This was measured, not
 * guessed — an instrumented autoplay logged every call, and before this ladder the ordering
 * was inverted: `land` (49 a run) was louder than `powerup`, which is the biggest reward in
 * the level. If you retune one of these, check it against the others rather than in
 * isolation.
 */

const SOUNDS = {
  /** Push-off: the moment the finger goes down. */
  jump: { type: 'blip', freq: [430, 700], dur: 0.09, wave: 'triangle', gain: 0.14, noise: 0.044 },
  /**
   * Footfall. By far the most-played sound in the game — measured at 3.2 a second of ground
   * time, about 160 in a clean run — so it is built to disappear into the background rather
   * than announce
   * itself: a third of the landing thud's volume, half its length, and low enough in the
   * spectrum to sit under everything else. The pitch jitter at the call site matters more
   * here than anywhere: identical repeats at this rate are what turn a footstep into a
   * rattle.
   */
  step: { type: 'thud', freq: [150, 68], dur: 0.06, wave: 'sine', gain: 0.05, noise: 0.032 },
  /** Landing impact: separate sound, triggered on touchdown. */
  land: { type: 'thud', freq: [180, 62], dur: 0.13, wave: 'sine', gain: 0.14, noise: 0.084 },
  /**
   * The pickup. Three rising pentatonic bells with a slow bloom — see TWINKLE below for why
   * it is built the way it is. The loudest thing in the game that fires more than 50 times
   * a run, which is as high as the ladder lets it go.
   */
  crystal: {
    type: 'twinkle',
    grains: 3,
    spread: 0.075,
    decay: 0.45,
    gain: 0.055,
    wet: 0.48,
    /**
     * Scale degrees the pickup may draw from: D4 up to G5. Deliberately LOW and narrow.
     * It started two octaves higher and was walked down from there — down, because dropping
     * the ceiling makes it blend into the bed instead of sitting on top of it, and across a
     * seventy-second run with 148 of them, blending is what keeps it off the ear. It is
     * meant to be present, not announced.
     *
     * It overlaps the pad's harmonics on purpose. The pad's chord tones sit at 87-220Hz with
     * saws opening through a 420-900Hz filter, so this range shares the room with them
     * rather than cutting through it. The gain was NOT raised to compensate for sitting
     * lower — the reduced presence is the point, not a side effect to correct.
     */
    floor: -5,
    top: 2
  },
  checkpoint: { type: 'arp', notes: [523, 659, 880], step: 0.075, dur: 0.2, gain: 0.22 },
  powerup: { type: 'arp', notes: [392, 523, 659, 784], step: 0.06, dur: 0.26, gain: 0.285 },
  hit: { type: 'hit', freq: [260, 55], dur: 0.34, gain: 0.3, noise: 0.32 },
  /**
   * Shield breaking: bright, glassy, falling — deliberately unlike the hit thud. Sits BELOW
   * `hit` on the ladder: this is the cushioned outcome, you were struck and survived, so it
   * should not out-shout actual damage.
   */
  shieldBreak: { type: 'shatter', notes: [1560, 1040, 690], step: 0.045, dur: 0.34, gain: 0.138, noise: 0.138 },
  /**
   * The win. Built in the crystal's language — pentatonic, staggered-attack sine partials,
   * heavy reverb — so it reads as the pickup's big brother rather than a jingle from another
   * game. It replaced a C major arpeggio on triangle waves: C major is in the bed's
   * progression so it was not wrong, but it was bright and arcade against music built to be
   * moody, and it shared no vocabulary with anything else in the mix.
   *
   * Six bells climbing two octaves of the scale, then a beat of space and a high D on top.
   * That last note is the point: it lands on the tonic, two octaves above where the climb
   * started, and it is the same resolution every crystal pickup reaches for — so the ending
   * answers the question 148 pickups spent the run asking. A low D holds underneath on the
   * bed's own root.
   *
   * Its attacks are slower than the crystal's (35/80/120ms against 26/60/95): a sound that
   * fires once can afford to bloom where one firing 148 times cannot. It can afford the
   * length too — music.stop(2.5) runs on the same frame, so this has the mix to itself.
   *
   * Loudest thing in the game, and it should be: it fires once per run.
   */
  win: {
    type: 'ascent',
    degrees: [0, 1, 3, 5, 6, 8],
    step: 0.13,
    decay: 1.9,
    gain: 0.155,
    falloff: 0.05,
    /** The resolution: a high tonic, held back a beat and rung longer than the climb. */
    peak: { degree: 10, delay: 0.18, gain: 0.135, decay: 2.4 },
    /** [ratio above D3, gain, start, attack, decay] — the root holding underneath. */
    drones: [[1, 0.2, 0, 0.6, 4]],
    wet: 0.66
  }
};

/**
 * D minor pentatonic. A pentatonic scale has no semitones and no tritone, so ANY two notes
 * drawn from it are consonant together. That is the whole trick: with 246 crystals in the
 * level and gaps as short as 17ms, pickups WILL land on top of each other, and this is what
 * makes a pile-up shimmer instead of clash. The sound it replaced jittered by whole
 * semitones, so two overlapping pickups could sit a minor 2nd apart.
 */
const PENTATONIC = [587.33, 698.46, 783.99, 879.87, 1046.5];   // D5 F5 G5 A5 C6

/**
 * Degree 0 is D5; every 5 degrees climbs an octave and negative degrees descend, so a voice
 * can reach as high or as low as it needs without the table enumerating octaves nothing uses.
 * The modulo is written the long way because JS keeps the sign: -3 % 5 is -3, not 2.
 */
const pentatonic = (degree) =>
  PENTATONIC[((degree % 5) + 5) % 5] * Math.pow(2, Math.floor(degree / 5));

const TWINKLE_PARTIALS = [[1, 1, 0.026], [2, 0.15, 0.06], [3, 0.02, 0.095]];

/** The same idea, slower. The win has room to bloom where a 148-a-run pickup does not. */
const ARRIVAL_PARTIALS = [[1, 1, 0.035], [2, 0.16, 0.08], [3, 0.03, 0.12]];

/**
 * A convolution reverb with no impulse-response file: exponentially decaying noise is the
 * standard trick and is indistinguishable from a recorded hall at this length.
 *
 * Lives here rather than in music.js because it is an audio primitive and both need it —
 * music.js imports it from here. Reverb is what lets a bright sound be bright without
 * stabbing: dry and bright pierces, wet and bright is airy.
 */
export function makeReverbIR(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.unlocked = false;
    this.noiseBuffer = null;
  }

  /** Build the context without playing anything (safe to call before any gesture). */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return;
    }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    // 1.0, not 0.85: trimming the music bed by 6dB took the whole mix down with it, and
    // there is headroom for this — the full run peaks around -5dBFS.
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    // One shared reverb send. Only the twinkle uses it today; a per-voice convolver would
    // be wasteful and the impacts are meant to be dry.
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 1;
    const verb = this.ctx.createConvolver();
    verb.buffer = makeReverbIR(this.ctx, 1.4, 2.6);
    this.wet.connect(verb).connect(this.master);

    // Pre-baked noise, used by the impact sounds.
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  /**
   * Must be called from inside a real user-gesture handler.
   * Resumes the context and pushes one silent buffer through it, which is what actually
   * satisfies iOS's unlock rule.
   */
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    src.connect(this.master);
    src.start(0);
    this.unlocked = true;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(name, { detune = 0, volume = 1 } = {}) {
    if (!this.enabled || !this.unlocked || !this.ctx) return;
    const def = SOUNDS[name];
    if (!def) return;
    const t = this.ctx.currentTime;
    const pitch = Math.pow(2, detune / 12);

    switch (def.type) {
      case 'blip':
      case 'thud':
      case 'hit': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = def.wave || 'sawtooth';
        osc.frequency.setValueAtTime(def.freq[0] * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, def.freq[1] * pitch), t + def.dur);
        gain.gain.setValueAtTime(def.gain * volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + def.dur);
        osc.connect(gain).connect(this.master);
        osc.start(t);
        osc.stop(t + def.dur + 0.02);
        if (def.noise) this.#noise(t, def.dur * 0.6, def.noise * volume, def.type === 'hit' ? 900 : 2400);
        break;
      }
      case 'twinkle': {
        // Start somewhere in the lower part of the scale, then step upward: rising reads as
        // "gained something" where falling reads as losing it.
        // Start somewhere in the lower part of the range, so there is room to climb.
        let rung = def.floor + Math.floor(Math.random() * (def.top - def.floor + 1) * 0.6);
        for (let g = 0; g < def.grains; g++) {
          const at = t + (g * def.spread) / (def.grains - 1);
          if (g > 0) {
            rung = Math.min(def.top, rung + 1 + Math.floor(Math.random() * 2));
          }
          // A few cents of wobble, so no two pickups are ever bit-identical.
          const freq = pentatonic(rung) * pitch * (0.997 + Math.random() * 0.006);
          const amp = def.gain * volume * (1 - g * 0.11);
          for (const [mult, partialAmp, attack] of TWINKLE_PARTIALS) {
            this.#bell(at, freq * mult, amp * partialAmp, attack, def.decay, def.wet);
          }
        }
        break;
      }
      case 'ascent': {
        const ring = (at, degree, amp, decay) => {
          for (const [mult, partialAmp, attack] of ARRIVAL_PARTIALS) {
            this.#bell(at, pentatonic(degree) * pitch * mult, amp * partialAmp, attack, decay, def.wet);
          }
        };
        def.degrees.forEach((degree, i) => {
          ring(t + i * def.step, degree, def.gain * volume * (1 - i * def.falloff), def.decay);
        });
        const top = def.peak;
        ring(t + def.degrees.length * def.step + top.delay, top.degree, top.gain * volume, top.decay);
        for (const [ratio, gain, start, attack, decay] of def.drones) {
          this.#bell(t + start, (pentatonic(0) / 4) * pitch * ratio, gain * volume, attack, decay, def.wet);
        }
        break;
      }
      case 'chime': {
        def.notes.forEach((n, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = n * pitch;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(def.gain * volume * (i === 0 ? 1 : 0.6), t + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + def.dur);
          osc.connect(gain).connect(this.master);
          osc.start(t);
          osc.stop(t + def.dur + 0.02);
        });
        break;
      }
      case 'shatter': {
        // Descending glass shards plus a short bright noise wash.
        def.notes.forEach((n, i) => {
          const at = t + i * def.step;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n * pitch, at);
          osc.frequency.exponentialRampToValueAtTime(n * pitch * 0.6, at + def.dur);
          gain.gain.setValueAtTime(def.gain * volume * (1 - i * 0.22), at);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + def.dur);
          osc.connect(gain).connect(this.master);
          osc.start(at);
          osc.stop(at + def.dur + 0.02);
        });
        this.#noise(t, 0.2, def.noise * volume, 5200);
        break;
      }
      case 'arp': {
        def.notes.forEach((n, i) => {
          const at = t + i * def.step;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = n * pitch;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(def.gain * volume, at + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + def.dur);
          osc.connect(gain).connect(this.master);
          osc.start(at);
          osc.stop(at + def.dur + 0.02);
        });
        break;
      }
      default:
        break;
    }
  }

  /**
   * One partial of one twinkle grain: a raised-cosine fade in, then a long exponential ring.
   * The curve matters — a linear ramp still has a corner at the start, and at these
   * frequencies a corner is audible as an edge.
   */
  #bell(at, freq, amp, attack, decay, wet) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    const steps = 32;
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) curve[i] = amp * (0.5 - 0.5 * Math.cos((Math.PI * i) / (steps - 1)));
    gain.gain.setValueCurveAtTime(curve, at, attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);

    osc.connect(gain);
    gain.connect(this.master);
    if (wet) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      gain.connect(send).connect(this.wet);
    }
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  #noise(t, dur, gainValue, cutoff) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioManager();

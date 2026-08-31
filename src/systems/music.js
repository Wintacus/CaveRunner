/**
 * Music.
 *
 * Synthesised through Web Audio like the sound effects, for the same reason: no binary
 * asset, no licence to track, and it loops perfectly because it is generated rather than
 * cut. A 90-second recorded loop would have cost roughly what the whole art swap costs
 * after compression.
 *
 * The brief: slow synth pad for a bioluminescent cave. Moody, multi-layered, smooth, easy
 * on the ears across a seventy-second run, and continuous through death — the music never
 * restarts, because a restart is the loudest possible way to announce that you just died.
 * References given were Hollow Knight, Ori and Subnautica; what those three share, and what
 * this is built to, is slow harmonic movement, a lot of reverb, and texture that evolves
 * instead of a tune that repeats.
 *
 * Four layers, so there is something to listen into rather than one flat wash:
 *
 *   bass     a sine drone on the chord root, two octaves down
 *   pad      the chord, detuned saws through a slowly moving lowpass
 *   shimmer  sparse high notes on chord tones, long decay, heavily reverbed
 *   air      a whisper of filtered noise; the cave itself
 *
 * All of it is scheduled ahead of time on the AudioContext clock rather than driven from
 * the game loop, so a frame-rate dip cannot make the music stutter.
 */

const LOOP_S = 90;
/** Eight chords over the loop, 11.25s each — slow enough that nothing repeats audibly. */
const CHORD_S = LOOP_S / 8;
/** Schedule this far ahead; the scheduler tick only has to beat this. */
const LOOKAHEAD_S = 2.5;
const TICK_MS = 400;

const midiToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * D natural minor. The progression is cyclic rather than cadential — no dominant pulling
 * home at the end — so the loop point lands in the middle of a phrase and cannot be heard.
 * Each entry is [root, third, fifth] as MIDI note numbers.
 */
const PROGRESSION = [
  [50, 53, 57], // Dm
  [46, 50, 53], // Bb
  [41, 45, 48], // F
  [48, 52, 55], // C
  [50, 53, 57], // Dm
  [46, 50, 53], // Bb
  [43, 46, 50], // Gm
  [48, 52, 55] // C
];

/**
 * Three directions, deliberately far apart. Judged by ear on a phone, not by reading these
 * numbers — the point of three is that two of them are wrong and that is still useful.
 */
export const VARIANTS = {
  /** Subnautica-leaning: deep, dark, almost no melody. Pressure rather than tune. */
  deep: {
    label: 'deep',
    padGain: 0.16,
    padCutoff: [420, 900],
    padDetune: 7,
    bassGain: 0.3,
    airGain: 0.05,
    shimmerGain: 0.05,
    shimmerPerChord: 1,
    shimmerOctave: 12,
    reverb: [3.2, 2.4]
  },
  /** Ori-leaning: brighter and wider, with a celeste-like sparkle over the pad. */
  lit: {
    label: 'lit',
    padGain: 0.13,
    padCutoff: [900, 2100],
    padDetune: 11,
    bassGain: 0.18,
    airGain: 0.03,
    shimmerGain: 0.085,
    shimmerPerChord: 4,
    shimmerOctave: 24,
    reverb: [3.8, 2.0]
  },
  /** Hollow Knight-leaning: mostly space. The quietest and the least busy. */
  sparse: {
    label: 'sparse',
    padGain: 0.09,
    padCutoff: [600, 1300],
    padDetune: 5,
    bassGain: 0.16,
    airGain: 0.02,
    shimmerGain: 0.1,
    shimmerPerChord: 2,
    shimmerOctave: 24,
    reverb: [4.5, 2.6]
  }
};

export const DEFAULT_VARIANT = 'deep';

/**
 * A convolution reverb with no impulse-response file: exponentially decaying noise is the
 * standard trick and is indistinguishable from a recorded hall at this length. Reverb is
 * most of what makes a pad "smooth" rather than "buzzy", so it is worth the node.
 */
function makeReverbIR(ctx, seconds, decay) {
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

class Music {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.playing = false;
    this.variant = null;
    this.timer = null;
    this.nextAt = 0;
    this.slot = 0;
    this.nodes = [];
  }

  /**
   * Idempotent on purpose. Respawning and restarting the level both call through here, and
   * both must leave the music exactly where it was.
   */
  start(audio, variantName = DEFAULT_VARIANT) {
    if (this.playing) return;
    if (!audio || !audio.ctx || !audio.master) return;
    const v = VARIANTS[variantName];
    if (!v) return;

    this.ctx = audio.ctx;
    this.variant = v;

    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.master);

    // Everything shares one reverb send; a per-voice convolver would be wasteful.
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.verb = ctx.createConvolver();
    this.verb.buffer = makeReverbIR(ctx, v.reverb[0], v.reverb[1]);
    this.wet.connect(this.verb).connect(this.out);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.85;
    this.dry.connect(this.out);

    this.#startAir();

    this.playing = true;
    this.slot = 0;
    this.nextAt = ctx.currentTime + 0.15;
    // Fade in over a couple of bars rather than arriving; the run has already started.
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 6);

    this.#tick();
    this.timer = setInterval(() => this.#tick(), TICK_MS);
  }

  stop(fade = 2) {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fade);
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    const toKill = this.nodes.slice();
    this.nodes.length = 0;
    setTimeout(() => toKill.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), (fade + 0.2) * 1000);
  }

  /** The scheduler: keep the next LOOKAHEAD_S of music committed to the audio clock. */
  #tick() {
    if (!this.playing) return;
    const ctx = this.ctx;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      this.#scheduleChord(PROGRESSION[this.slot], this.nextAt);
      this.nextAt += CHORD_S;
      this.slot = (this.slot + 1) % PROGRESSION.length;
    }
    // Voices are fire-and-forget; drop the finished ones so the list cannot grow forever.
    this.nodes = this.nodes.filter((n) => n.__endsAt > ctx.currentTime);
  }

  #scheduleChord(chord, at) {
    const v = this.variant;
    // Chords overlap by design: each voice releases well past the next one's attack, so the
    // harmony crossfades instead of stepping.
    const hold = CHORD_S;
    const attack = 3.5;
    const release = 5.5;

    // Bass drone, two octaves under the root.
    this.#voice({
      freq: midiToFreq(chord[0] - 24),
      type: 'sine',
      gain: v.bassGain,
      at,
      attack: 4,
      hold,
      release: 5,
      cutoff: null
    });

    // Pad: every chord tone, two detuned saws each.
    for (const note of chord) {
      for (const cents of [-v.padDetune, v.padDetune]) {
        this.#voice({
          freq: midiToFreq(note),
          detune: cents,
          type: 'sawtooth',
          gain: v.padGain / 2,
          at,
          attack,
          hold,
          release,
          cutoff: v.padCutoff
        });
      }
    }

    // Shimmer: a few chord tones high up, placed off the beat so they never feel metrical.
    for (let i = 0; i < v.shimmerPerChord; i++) {
      const note = chord[Math.floor(Math.random() * chord.length)] + v.shimmerOctave;
      const offset = (0.15 + Math.random() * 0.7) * CHORD_S;
      this.#voice({
        freq: midiToFreq(note),
        type: 'triangle',
        gain: v.shimmerGain,
        at: at + offset,
        attack: 0.35,
        hold: 0.2,
        release: 3.5,
        cutoff: null
      });
    }
  }

  #voice({ freq, detune = 0, type, gain, at, attack, hold, release, cutoff }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(gain, at + attack);
    amp.gain.setValueAtTime(gain, at + attack + hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);

    let node = osc;
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      // The filter opens and closes across the chord. This is the "evolving" part — without
      // it a held pad is static and the ear stops hearing it within a few seconds.
      filter.frequency.setValueAtTime(cutoff[0], at);
      filter.frequency.linearRampToValueAtTime(cutoff[1], at + attack + hold * 0.5);
      filter.frequency.linearRampToValueAtTime(cutoff[0], at + attack + hold + release);
      node = osc.connect(filter);
    }
    node.connect(amp);
    amp.connect(this.dry);
    amp.connect(this.wet);

    const endsAt = at + attack + hold + release + 0.1;
    osc.start(at);
    osc.stop(endsAt);
    osc.__endsAt = endsAt;
    this.nodes.push(osc);
  }

  /** Continuous filtered noise, barely audible. It is the room the rest of it sits in. */
  #startAir() {
    const ctx = this.ctx;
    const v = this.variant;
    const len = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;

    // A slow sweep, far below anything the ear tracks as movement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.02;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);

    const amp = ctx.createGain();
    amp.gain.value = v.airGain;

    src.connect(filter).connect(amp);
    amp.connect(this.dry);
    amp.connect(this.wet);

    src.start();
    lfo.start();
    src.__endsAt = Infinity;
    lfo.__endsAt = Infinity;
    this.nodes.push(src, lfo);
  }
}

export const music = new Music();

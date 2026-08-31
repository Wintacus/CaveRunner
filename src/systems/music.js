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

import { makeReverbIR } from './audio.js';

const LOOP_S = 90;
/** Eight chords over the loop, 11.25s each — slow enough that nothing repeats audibly. */
const CHORD_S = LOOP_S / 8;
/** Schedule this far ahead; the scheduler tick only has to beat this. */
const LOOKAHEAD_S = 2.5;
const TICK_MS = 400;
/** Level of the whole bed against the sound effects. See the ramp in start(). */
const BED_GAIN = 0.5;

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
 * The voicing. Subnautica-leaning: deep, dark, almost no melody — pressure rather than tune.
 * Chosen by ear on a phone from three candidates that were deliberately far apart; the other
 * two (a brighter Ori-leaning one and a sparser Hollow Knight-leaning one) are gone, and the
 * git history is where they live now if that judgement ever needs revisiting.
 */
const TONE = {
  padGain: 0.16,
  padCutoff: [420, 900],
  padDetune: 7,
  bassGain: 0.3,
  airGain: 0.05,
  shimmerGain: 0.05,
  shimmerPerChord: 1,
  shimmerOctave: 12,
  reverb: [3.2, 2.4]
};

class Music {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.playing = false;
    this.timer = null;
    this.nextAt = 0;
    this.slot = 0;
    this.nodes = [];
  }

  /**
   * Idempotent on purpose. Respawning and restarting the level both call through here, and
   * both must leave the music exactly where it was.
   */
  start(audio) {
    if (this.playing) return;
    if (!audio || !audio.ctx || !audio.master) return;

    this.ctx = audio.ctx;

    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.master);

    // Everything shares one reverb send; a per-voice convolver would be wasteful.
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.verb = ctx.createConvolver();
    this.verb.buffer = makeReverbIR(ctx, TONE.reverb[0], TONE.reverb[1]);
    this.wet.connect(this.verb).connect(this.out);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.85;
    this.dry.connect(this.out);

    this.#startAir();

    this.playing = true;
    this.slot = 0;
    this.nextAt = ctx.currentTime + 0.15;
    // Fade in over a couple of bars rather than arriving; the run has already started.
    // BED_GAIN, not 1: at full level the bed measured -12.3dBFS RMS and every sound effect
    // sat at or below its *average*, so nothing had room to read. -6dB is what gives the
    // effects somewhere to sit; the master gain was raised to compensate.
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(BED_GAIN, ctx.currentTime + 6);

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
    // Chords overlap by design: each voice releases well past the next one's attack, so the
    // harmony crossfades instead of stepping.
    const hold = CHORD_S;
    const attack = 3.5;
    const release = 5.5;

    // Bass drone, two octaves under the root.
    this.#voice({
      freq: midiToFreq(chord[0] - 24),
      type: 'sine',
      gain: TONE.bassGain,
      at,
      attack: 4,
      hold,
      release: 5,
      cutoff: null
    });

    // Pad: every chord tone, two detuned saws each.
    for (const note of chord) {
      for (const cents of [-TONE.padDetune, TONE.padDetune]) {
        this.#voice({
          freq: midiToFreq(note),
          detune: cents,
          type: 'sawtooth',
          gain: TONE.padGain / 2,
          at,
          attack,
          hold,
          release,
          cutoff: TONE.padCutoff
        });
      }
    }

    // Shimmer: a few chord tones high up, placed off the beat so they never feel metrical.
    for (let i = 0; i < TONE.shimmerPerChord; i++) {
      const note = chord[Math.floor(Math.random() * chord.length)] + TONE.shimmerOctave;
      const offset = (0.15 + Math.random() * 0.7) * CHORD_S;
      this.#voice({
        freq: midiToFreq(note),
        type: 'triangle',
        gain: TONE.shimmerGain,
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
    amp.gain.value = TONE.airGain;

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

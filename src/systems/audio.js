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
  /**
   * Push-off. It ADVANCES the walk without voicing it — no `note`, so no pitch is heard —
   * and only the landing sounds. See MOTION_RANGE for why. Its body is at full strength
   * because nothing else here is carrying the sound.
   */
  jump: {
    type: 'bound', step: 1,
    freq: [430, 700], dur: 0.09, wave: 'triangle', gain: 0.14, noise: 0.044
  },
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
  /** Landing impact: separate sound, triggered on touchdown. Answers the jump's note. */
  land: {
    type: 'bound', step: -1,
    freq: [180, 62], dur: 0.12, wave: 'sine', gain: 0.08, noise: 0.07,
    note: { gain: 0.04, decay: 0.35 }, wet: 0.55
  },
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
  /**
   * Checkpoint. The odd one out: a bare triangle-wave arpeggio straight to the master, on
   * C-E-A, while every other cue in the game is a bell on the pentatonic table through the
   * shared reverb. That is why it reads as a jingle borrowed from another game rather than
   * as this cave telling you something.
   *
   * Three candidates below, all in the family. Two of them get deleted once one is picked.
   */
  checkpoint: { type: 'arp', notes: [523, 659, 880], step: 0.075, dur: 0.2, gain: 0.22 },
  /** A: three bells climbing to the octave, the last left ringing. Progress, locked in. */
  checkpointA: { type: 'arrive', shape: 'rise', gain: 1, wet: 0.6 },
  /** B: a low bloom opening underneath, two bright lights coming up out of it. Shelter. */
  checkpointB: { type: 'arrive', shape: 'bloom', gain: 1, wet: 0.66 },
  /** C: two notes, a rising fourth, generous decay. The quietest thing that still lands. */
  checkpointC: { type: 'arrive', shape: 'bell', gain: 1, wet: 0.62 },
  /**
   * Shield pickup. The reward, so it belongs to the crystal's family — pentatonic, through
   * the shared reverb — but warmer, wider and SUSTAINED: a noise swell closing around you,
   * three bells rising over it, and a fifth left ringing after them. Where a crystal is a
   * gesture, this is something arriving and then staying.
   */
  powerup: { type: 'ward', gain: 1.13, wet: 0.55 },
  /**
   * Death. Modelled on how Ori and Hollow Knight handle it, which is the opposite of an
   * impact: death reads as DISSIPATION, not collision. Neither game smashes — the meaning is
   * carried by descending, spreading motion, energy leaving, rather than by a hard hit.
   *
   * So: a single deep toll on inharmonic partials, a breath of filtered air, four lights
   * scattering and falling away above it, and the tonic sagging a minor third flat
   * underneath. The sag is what stops it resolving; it deflates rather than lands.
   *
   * This is also the one place the pentatonic language is allowed to break, because breaking
   * it is the signal.
   */
  hit: { type: 'toll', gain: 1.48, wet: 0.66 },
  /**
   * Shield breaking. Literally the pickup's phrase INVERTED — same bells, same register,
   * falling instead of rising — so the pair reads as a thing given and then taken back
   * rather than as two unrelated sounds at related moments. Its held fifth is gated off
   * mid-fall: you hear the sustain STOP, which is the part that says it is gone.
   *
   * It opens with a pop. A pop is not a crack: a crack is filtered noise, a pop is PITCHED,
   * a short sine whose frequency collapses downward in about 25ms. That descending sweep is
   * the whole character, and it is what makes the moment read as something giving way.
   *
   * Sits BELOW `hit` on the ladder: this is the cushioned outcome — you were struck and you
   * survived — so it has no business out-shouting actual damage.
   */
  shieldBreak: { type: 'sever', gain: 0.53, wet: 0.5 },
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
    /**
     * The resolution: a high tonic, held back a beat and rung longer than the climb.
     *
     * Its gain is well under the climb's because of where it sits. Degree 10 is 2349Hz —
     * the fundamental itself is inside the 2-5kHz band the ear peaks at, so thinning its
     * partials alone did nothing; the note's own level had to come down. It is still the
     * highest and last thing in the game, just no longer the loudest.
     */
    peak: { degree: 10, delay: 0.18, gain: 0.088, decay: 2.4 },
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
 * Partials for the three rare sounds. These deliberately do NOT get the crystal's staggered
 * soft onset: that treatment exists because the pickup fires 148 times a run, and these fire
 * once or twice. Rarity earns presence, so they lead with a real transient instead.
 *
 * Learned the hard way. A first pass gave them 35-120ms attacks and put their energy at
 * 147-590Hz, which is both where the bed's pad and bass sit AND where A-weighting discounts
 * the ear by ~15dB — masked and perceptually quiet at once, and inaudible in play despite
 * measuring correctly on peak. Peak is the wrong yardstick for this; loudness is.
 */
const PING_PARTIALS = [[1, 1], [2, 0.3], [3, 0.1], [4.2, 0.04]];
/** Inharmonic, so the death toll reads as struck metal rather than a note. */
const TOLL_PARTIALS = [[1, 1], [2.32, 0.3], [3.5, 0.13], [4.6, 0.06]];
const SCATTER_PARTIALS = [[1, 1], [2.7, 0.18]];
/** Quick but not sharp: two partials, for sounds that fire ninety-odd times a run. */
const MOTION_PARTIALS = [[1, 1, 0.008], [2, 0.05, 0.02]];

/**
 * Motion carries a pitch, and it WALKS: every jump steps up the scale, every landing steps
 * back down, each continuing from wherever the last one left it. That memory is the point —
 * an independent random note is varied but goes nowhere, while a walk wanders like a bass
 * line across a run.
 *
 * Only the LANDING is voiced. Both halves of the motion still move the walk, so the line
 * wanders exactly as it did when both were audible; the jump simply takes its step in
 * silence. Voicing both was a tad busy — it put pitched events at 3.5 a second against the
 * crystals' 2.1 — and voicing only the landing halves that back to 2.8 without flattening
 * the line into a repeating descent, which is what stepping only downward would give.
 * Landing is also the better half to keep: it is the resolution of the gesture.
 *
 * Degrees -11..-4 is 131-349Hz, well under the crystal's 294-784. That separation is
 * deliberate and it follows from a measurement: 67 of the 98 jump/land events in a run land
 * within 120ms of a crystal pickup, so these are heard *simultaneously* with the melody far
 * more often than between its notes. They cannot be a second tune; there is no room. They
 * are harmony underneath the one that already exists, which is why they sit low and quiet.
 *
 * Pentatonic is what makes that safe: no semitones and no tritone, so a jump colliding with
 * a pickup is consonant whichever two notes meet.
 */
const MOTION_RANGE = [-11, -4];

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
    /** Where the jump/land walk currently sits. Starts mid-range; bounded, so it never runs away. */
    this.motionRung = -7;
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

    // Pre-baked noise, used by the impact sounds. It fades out across the buffer, which is
    // what a transient wants.
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

    // A second, FLAT buffer. The swell shapes its own envelope and needs noise that does not
    // decay underneath it.
    const flatLen = Math.floor(this.ctx.sampleRate);
    this.flatNoise = this.ctx.createBuffer(1, flatLen, this.ctx.sampleRate);
    const flat = this.flatNoise.getChannelData(0);
    for (let i = 0; i < flatLen; i++) flat[i] = Math.random() * 2 - 1;
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
      case 'thud': {
        this.#body(t, def, volume, pitch);
        break;
      }
      case 'bound': {
        // The body takes the caller's detune — that jitter is what stops ninety repeats
        // becoming a rattle. The note does not: it belongs to the scale, and detuning it
        // would be the one thing that could make these clash.
        this.#body(t, def, volume, pitch);
        const [low, high] = MOTION_RANGE;
        const move = def.step * (1 + Math.floor(Math.random() * 3));
        this.motionRung = Math.max(low, Math.min(high, this.motionRung + move));
        if (def.note) {
          this.#ping(t, pentatonic(this.motionRung), def.note.gain * volume, def.note.decay,
            0.008, def.wet, MOTION_PARTIALS);
        }
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
        /**
         * Upper partials thin out as the phrase climbs. The resolution sits at degree 10 —
         * 2349Hz — and at full strength its second partial lands at 4698Hz, the most
         * sensitive part of human hearing, ringing alone after the bed has begun to fade.
         * That was the whole of the sting at the end. The fundamental is untouched, so the
         * note is as high as it ever was; only its brightness comes off.
         */
        const ring = (at, degree, amp, decay, slower = 1) => {
          const bright = Math.max(0.22, 1 - degree * 0.09);
          ARRIVAL_PARTIALS.forEach(([mult, partialAmp, attack], i) => {
            this.#bell(at, pentatonic(degree) * pitch * mult, amp * partialAmp * (i === 0 ? 1 : bright),
              attack * slower, decay, def.wet);
          });
        };
        def.degrees.forEach((degree, i) => {
          ring(t + i * def.step, degree, def.gain * volume * (1 - i * def.falloff), def.decay);
        });
        const top = def.peak;
        // A slower bloom on the resolution too: it is the one note with nothing to hide behind.
        ring(t + def.degrees.length * def.step + top.delay, top.degree, top.gain * volume, top.decay, 1.5);
        for (const [ratio, gain, start, attack, decay] of def.drones) {
          this.#bell(t + start, (pentatonic(0) / 4) * pitch * ratio, gain * volume, attack, decay, def.wet);
        }
        break;
      }
      case 'ward': {
        // Shield pickup: a swell closing in, three bells rising through it, a fifth left
        // ringing, and a low anchor for body.
        const g = def.gain * volume;
        this.#swell(t, 0.55, 0.1 * g, 700, 3200, def.wet);
        [0, 3, 5].forEach((degree, i) => {
          this.#ping(t + 0.04 + i * 0.08, pentatonic(degree), 0.15 * g * (1 - i * 0.06), 1.2, 0.005, def.wet);
        });
        this.#hold(t + 0.15, pentatonic(5), 0.05 * g, 0.15, 0.55, 1, def.wet);
        this.#ping(t, pentatonic(-5), 0.055 * g, 0.7, 0.004, def.wet);
        break;
      }
      case 'sever': {
        // Shield break: the pickup's fifth still ringing, a pop, a crack, then the pickup's
        // own phrase falling back down. The ring is gated off while the fall is still going.
        const g = def.gain * volume;
        this.#hold(t, pentatonic(5), 0.075 * g, 0.01, 0.2, 0.035, def.wet);
        this.#hold(t, pentatonic(8), 0.05 * g, 0.01, 0.2, 0.035, def.wet);
        this.#pop(t, 1400, 260, 0.17 * g, 0.025, def.wet);
        this.#noise(t + 0.004, 0.045, 0.085 * g, 5400, def.wet);
        [5, 3, 0].forEach((degree, i) => {
          this.#ping(t + 0.04 + i * 0.075, pentatonic(degree), 0.145 * g * (1 - i * 0.05), 0.6, 0.003, def.wet);
        });
        break;
      }
      case 'toll': {
        // Death: a deep inharmonic toll, a breath of air, lights scattering away above it,
        // and the tonic sagging flat underneath so nothing resolves.
        const g = def.gain * volume;
        this.#ping(t, pentatonic(-10), 0.2 * g, 2.4, 0.006, def.wet, TOLL_PARTIALS);
        this.#noise(t, 0.18, 0.11 * g, 1100, def.wet);
        for (let i = 0; i < 4; i++) {
          const frac = i / 3;
          const at = t + 0.06 + frac * 0.4 * (0.6 + Math.random() * 0.7);
          const freq = 1500 * Math.pow(700 / 1500, frac) * (0.94 + Math.random() * 0.12);
          this.#ping(at, freq, 0.055 * g * (1 - frac * 0.55), 0.45 * (1 - frac * 0.3),
            0.004, def.wet, SCATTER_PARTIALS);
        }
        this.#glide(t + 0.02, pentatonic(0), pentatonic(0) * 0.84, 0.09 * g, 0.02, 1.1, def.wet);
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
      case 'arrive': {
        const g = def.gain * volume;
        if (def.shape === 'rise') {
          [0, 2, 5].forEach((d, i) =>
            this.#ping(t + i * 0.085, pentatonic(d - 5) * pitch, 0.13 * g * (1 - i * 0.05), 1.1 + i * 0.5, 0.005, def.wet));
          this.#hold(t + 0.17, pentatonic(0) * pitch, 0.03 * g, 0.12, 0.5, 0.9, def.wet);
        } else if (def.shape === 'bloom') {
          this.#swell(t, 0.5, 0.07 * g, 500, 2600, def.wet);
          this.#ping(t, pentatonic(-10) * pitch, 0.1 * g, 1.8, 0.006, def.wet);
          this.#ping(t + 0.16, pentatonic(2) * pitch, 0.12 * g, 1.6, 0.004, def.wet);
          this.#ping(t + 0.24, pentatonic(5) * pitch, 0.085 * g, 2.0, 0.004, def.wet);
        } else {
          this.#ping(t, pentatonic(-3) * pitch, 0.14 * g, 1.5, 0.005, def.wet);
          this.#ping(t + 0.13, pentatonic(1) * pitch, 0.13 * g, 2.2, 0.005, def.wet);
          this.#hold(t + 0.13, pentatonic(1) * pitch, 0.028 * g, 0.15, 0.6, 1.0, def.wet);
        }
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
    // The ramp must end after the curve does, or Web Audio throws NotSupportedError for
    // overlapping automation and takes the whole sound with it. Every caller today passes a
    // decay far longer than its attack; this is here so a future one that does not cannot
    // crash playback.
    gain.gain.setValueCurveAtTime(curve, at, attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(decay, attack + 0.01));

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

  /** The physical layer of an impact: a swept tone plus a noise body. */
  #body(t, def, volume, pitch) {
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
    if (def.noise) this.#noise(t, def.dur * 0.6, def.noise * volume, 2400);
  }

  /** A struck tone: several partials sharing one fast attack, unlike the twinkle's stagger. */
  #ping(at, freq, amp, decay, attack, wet, partials = PING_PARTIALS) {
    for (const [mult, partialAmp] of partials) {
      this.#bell(at, freq * mult, amp * partialAmp, attack, decay, wet);
    }
  }

  /** A sustained tone with a real hold, so it can be cut off deliberately. */
  #hold(at, freq, amp, attack, sustain, release, wet) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(amp, at + attack);
    gain.gain.setValueAtTime(amp, at + attack + sustain);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + sustain + release);
    this.#route(osc, gain, wet);
    osc.start(at);
    osc.stop(at + attack + sustain + release + 0.02);
  }

  /**
   * A pop. Pitched, not noise: the frequency collapses downward over a couple of dozen
   * milliseconds, which is what a bubble bursting actually is. The short noise burst on the
   * front is the lip — without it the pop fades in instead of starting.
   */
  #pop(at, from, to, amp, dur, wet) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    this.#route(osc, gain, wet);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    this.#noise(at, 0.0025, amp * 0.25, 9000, wet);
  }

  /** A tone that slides. Downward is the sound of something going wrong. */
  #glide(at, from, to, amp, attack, decay, wet) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + decay);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(amp, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    this.#route(osc, gain, wet);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  /** Band-passed noise whose centre rises while it fades in and out: something forming. */
  #swell(at, dur, amp, from, to, wet) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.linearRampToValueAtTime(to, at + dur);
    const gain = this.ctx.createGain();
    const steps = 48;
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) curve[i] = amp * Math.sin((Math.PI * i) / (steps - 1));
    gain.gain.setValueCurveAtTime(curve, at, dur);
    src.connect(filter);
    this.#route(filter, gain, wet);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  /** Wire a source through its gain to the dry master and, optionally, the reverb send. */
  #route(source, gain, wet) {
    source.connect(gain);
    gain.connect(this.master);
    if (wet) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      gain.connect(send).connect(this.wet);
    }
  }

  #noise(t, dur, gainValue, cutoff, wet = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    this.#route(filter, gain, wet);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioManager();

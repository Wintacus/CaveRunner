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
 */

const SOUNDS = {
  /** Push-off: the moment the finger goes down. */
  jump: { type: 'blip', freq: [430, 700], dur: 0.09, wave: 'triangle', gain: 0.16, noise: 0.05 },
  /** Landing impact: separate sound, triggered on touchdown. */
  land: { type: 'thud', freq: [180, 62], dur: 0.13, wave: 'sine', gain: 0.2, noise: 0.12 },
  crystal: { type: 'chime', notes: [1180, 1760], dur: 0.14, gain: 0.1 },
  checkpoint: { type: 'arp', notes: [523, 659, 880], step: 0.075, dur: 0.2, gain: 0.14 },
  powerup: { type: 'arp', notes: [392, 523, 659, 784], step: 0.06, dur: 0.26, gain: 0.15 },
  hit: { type: 'hit', freq: [260, 55], dur: 0.34, gain: 0.24, noise: 0.3 },
  /** Shield breaking: bright, glassy, falling — deliberately unlike the hit thud. */
  shieldBreak: { type: 'shatter', notes: [1560, 1040, 690], step: 0.045, dur: 0.34, gain: 0.16, noise: 0.22 },
  win: { type: 'arp', notes: [523, 659, 784, 1046, 1318], step: 0.11, dur: 0.5, gain: 0.18 }
};

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
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

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

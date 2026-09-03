/**
 * discoBeat.ts — an original surf-rock instrumental, synthesised live.
 *
 * Written in the same lane as the fast Mediterranean surf-rock that powers a
 * certain party anthem: 130 BPM, tremolo-picked lead in E Phrygian dominant,
 * driving double-time drums, spring-reverb slapback. The melody here is my own
 * — this is a piece written in a style, not a reproduction of a recording.
 *
 * Everything is Web Audio: oscillators, a noise buffer, a waveshaper for grit
 * and a delay line for the surf slapback. No files, no network, no licences.
 *
 * Scheduling uses the standard lookahead pattern — a timer wakes every 25ms and
 * schedules any note falling inside the next 120ms, because setTimeout is far
 * too jittery to place a 16th note at 130 BPM.
 */

const BPM = 130;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;          // one sixteenth
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

// E Phrygian dominant: E F G# A B C D — the scale that makes this style sing.
const E3 = 52, F3 = 53, G3 = 56, A3 = 57, B3 = 59, C4 = 60, D4 = 62, E4 = 64;
const F4 = 65, G4 = 68, A4 = 69, B4 = 71;

/** [midi note, length in sixteenths]. Original melody. */
type Note = [number, number];

const PHRASE_A: Note[] = [
  [B3, 4], [C4, 2], [B3, 2], [A3, 4], [G3, 4],
  [A3, 4], [B3, 2], [A3, 2], [G3, 4], [F3, 4],
  [E3, 8], [F3, 4], [G3, 4],
  [A3, 4], [B3, 4], [C4, 2], [B3, 2], [A3, 4],
];

const PHRASE_B: Note[] = [
  [E4, 4], [F4, 2], [E4, 2], [D4, 4], [C4, 4],
  [B3, 4], [C4, 2], [D4, 2], [E4, 8],
  [G4, 4], [F4, 2], [E4, 2], [D4, 4], [C4, 4],
  [B4, 6], [A4, 2], [G4, 4], [E4, 4],
];

/** Root note per bar, for the bass. Four bars, looping. */
const BASS_ROOTS = [E3 - 12, F3 - 12, E3 - 12, B3 - 12];

// Sixteenth-step patterns across one bar.
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];

function makeDistortion(ctx: AudioContext, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = '4x';
  return ws;
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export interface BeatEvent {
  /** Sixteenth-step index within the bar, 0..15. */
  step: number;
  /** Bar counter since the music started. */
  bar: number;
  kick: boolean;
  snare: boolean;
}

export class DiscoBeat {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private guitarBus: AudioNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  /** Index into the current phrase, and how many sixteenths are left on it. */
  private noteIdx = 0;
  private noteLeft = 0;
  private playing = false;

  onBeat: ((e: BeatEvent) => void) | null = null;

  get isPlaying(): boolean { return this.playing; }

  /** Must be called from a user gesture or the context will stay suspended. */
  async start(volume = 0.5): Promise<boolean> {
    if (this.playing) return true;
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      const ctx = this.ctx ?? new Ctor();
      this.ctx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state !== 'running') return false;

      if (!this.master) {
        this.master = ctx.createGain();
        this.master.gain.value = volume;
        this.master.connect(ctx.destination);

        // Surf slapback: short delay with a little feedback, sitting under the lead.
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = BEAT / 2;
        const fb = ctx.createGain();
        fb.gain.value = 0.28;
        const wet = ctx.createGain();
        wet.gain.value = 0.35;
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(wet);
        wet.connect(this.master);

        const dry = ctx.createGain();
        dry.gain.value = 1;
        dry.connect(this.master);
        dry.connect(delay);
        this.guitarBus = dry;
      }
      this.noise = this.noise ?? makeNoise(ctx);

      this.playing = true;
      this.nextTime = ctx.currentTime + 0.06;
      this.step = 0;
      this.bar = 0;
      this.noteIdx = 0;
      this.noteLeft = 0;
      this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS);
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (this.master && this.ctx) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      window.setTimeout(() => {
        if (!this.playing && this.master) this.master.gain.value = 0;
      }, 400);
    }
  }

  setVolume(v: number): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.05);
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    if (this.master) this.master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.05);

    while (this.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.playStep(this.nextTime, this.step, this.bar);
      this.nextTime += STEP;
      this.step++;
      if (this.step >= 16) { this.step = 0; this.bar++; }
    }
  }

  private playStep(t: number, step: number, bar: number): void {
    const ctx = this.ctx!;
    if (KICK[step]) this.kick(t);
    if (SNARE[step]) this.snare(t);
    if (HAT[step]) this.hat(t, step % 4 === 0 ? 0.16 : 0.08);

    // Bass on eighths, root of the bar.
    if (step % 2 === 0) {
      this.bass(t, midi(BASS_ROOTS[bar % BASS_ROOTS.length]!));
    }

    // Lead: eight bars of phrase A, eight of phrase B, forever.
    const phrase = Math.floor(bar / 8) % 2 === 0 ? PHRASE_A : PHRASE_B;
    if (this.noteLeft <= 0) {
      this.noteIdx = this.noteIdx % phrase.length;
      this.noteLeft = phrase[this.noteIdx]![1];
    }
    const note = phrase[this.noteIdx % phrase.length]!;
    // Tremolo picking: re-attack the same note on every sixteenth.
    this.pick(t, midi(note[0]), this.noteLeft === note[1]);
    this.noteLeft--;
    if (this.noteLeft <= 0) this.noteIdx++;

    this.onBeat?.({ step, bar, kick: !!KICK[step], snare: !!SNARE[step] });
    void ctx;
  }

  private pick(t: number, freq: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    // A touch of pitch scoop on the accented attack: the pick digging in.
    if (accent) {
      osc.frequency.setValueAtTime(freq * 0.985, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
    }

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 1.1;

    const drive = makeDistortion(ctx, 12);

    const g = ctx.createGain();
    const peak = accent ? 0.20 : 0.13;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + STEP * 0.95);

    osc.connect(band);
    band.connect(drive);
    drive.connect(g);
    g.connect(this.guitarBus!);
    osc.start(t);
    osc.stop(t + STEP);
  }

  private bass(t: number, freq: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.20, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.7);
    osc.connect(lp); lp.connect(g); g.connect(this.master!);
    osc.start(t);
    osc.stop(t + STEP * 2);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g); g.connect(this.master!);
    osc.start(t); osc.stop(t + 0.18);
  }

  private snare(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(bp); bp.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + 0.16);

    // A little body under the crack so it is not just hiss.
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(240, t);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.22, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    body.connect(bg); bg.connect(this.master!);
    body.start(t); body.stop(t + 0.1);
  }

  private hat(t: number, level: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(hp); hp.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + 0.05);
  }
}

/** One shared instance; there is only ever one party. */
export const discoBeat = new DiscoBeat();

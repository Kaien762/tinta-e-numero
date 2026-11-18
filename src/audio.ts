/**
 * Todo o som é sintetizado na hora (Web Audio): efeitos e uma musiquinha em loop.
 * Dois volumes independentes (música e efeitos), guardados no navegador.
 */

const KEY = 'tinta.som.v2';

export interface Volumes {
  music: number;
  sfx: number;
}

function loadVolumes(): Volumes {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Volumes>;
      return { music: clamp01(v.music ?? 0.5), sfx: clamp01(v.sfx ?? 0.8) };
    }
  } catch {
    /* padrão */
  }
  return { music: 0.5, sfx: 0.8 };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number(v) || 0));
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ------------------------------------------------------------ partitura
// 8 compassos em colcheias, Dó maior: C - Am - F - G (duas vezes, a segunda com outra melodia).
const _ = null;
const LEAD: (number | null)[] = [
  76, 79, 84, 79, 76, _, 74, 76,
  72, 76, 81, 76, 72, _, 71, 72,
  69, 72, 77, 72, 69, _, 67, 69,
  71, 74, 79, 77, 74, _, 71, 74,
  79, _, 76, 79, 84, _, 83, 81,
  79, _, 76, 72, 76, _, 74, 72,
  77, _, 81, 77, 79, _, 81, 83,
  84, _, 79, 76, 74, _, _, _,
];
const ROOTS = [36, 33, 29, 31, 36, 33, 29, 31]; // C2 A1 F1 G1
const CHORDS = [
  [60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62],
  [60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62],
];
const BASS_STEPS: (number | null)[] = [0, _, 12, _, 7, _, 12, 7];

class Music {
  bpm = 116;
  private ctx: AudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private timer = 0;
  private step = 0;
  private next = 0;

  constructor(ctx: AudioContext, out: GainNode, noise: AudioBuffer) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
  }

  start(): void {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private schedule(): void {
    const eighth = 60 / this.bpm / 2;
    // aba voltou de segundo plano: não tenta tocar o atraso inteiro de uma vez
    if (this.next < this.ctx.currentTime - 0.2) this.next = this.ctx.currentTime + 0.05;
    while (this.next < this.ctx.currentTime + 0.15) {
      this.play(this.step, this.next, eighth);
      this.next += eighth;
      this.step = (this.step + 1) % LEAD.length;
    }
  }

  private play(step: number, t: number, eighth: number): void {
    const bar = Math.floor(step / 8);
    const pos = step % 8;
    const lead = LEAD[step];
    if (lead !== null) this.pluck(midi(lead), t, eighth * 1.6, 0.11);
    if (pos % 2 === 1) {
      const chord = CHORDS[bar];
      this.pluck(midi(chord[(pos >> 1) % 3] + 12), t, eighth * 0.9, 0.035, 'sine');
    }
    const b = BASS_STEPS[pos];
    if (b !== null) this.bass(midi(ROOTS[bar] + 12 + b), t, eighth * 0.95);
    if (pos === 0 || pos === 4) this.kick(t);
    if (pos === 2 || pos === 6) this.burst(t, 0.09, 1800, 1.2, 0.09, 'bandpass');
    if (pos % 2 === 1) this.burst(t, 0.035, 8000, 0.8, 0.035, 'highpass');
  }

  private pluck(f: number, t: number, dur: number, gain: number, type: OscillatorType = 'triangle'): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private bass(f: number, t: number, dur: number): void {
    this.pluck(f, t, dur, 0.16, 'triangle');
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.18);
  }

  private burst(t: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.2);
    s.stop(t + dur + 0.02);
  }
}

export class Sfx {
  volumes: Volumes = loadVolumes();
  private ctx: AudioContext | null = null;
  private sfxOut: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private music: Music | null = null;
  private wantMusic = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { music: clamp01(v.music ?? this.volumes.music), sfx: clamp01(v.sfx ?? this.volumes.sfx) };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.volumes));
    } catch {
      /* ignora */
    }
    this.unlock();
    this.applyVolumes();
  }

  /** Liga a música assim que o áudio puder tocar. */
  playMusic(): void {
    this.wantMusic = true;
    if (this.music && this.volumes.music > 0) this.music.start();
  }

  /** Ritmo da música: acelera no fim do Relâmpago. */
  setTempo(bpm: number): void {
    if (this.music) this.music.bpm = bpm;
  }

  /** Precisa ser chamado dentro de um gesto do usuário (política dos navegadores). */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createDynamicsCompressor();
      master.connect(ctx.destination);
      const sfxOut = ctx.createGain();
      const musicOut = ctx.createGain();
      const warm = ctx.createBiquadFilter();
      warm.type = 'lowpass';
      warm.frequency.value = 5200;
      musicOut.connect(warm).connect(master);
      sfxOut.connect(master);
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.sfxOut = sfxOut;
      this.musicOut = musicOut;
      this.noiseBuf = buf;
      this.music = new Music(ctx, musicOut, buf);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
    if (this.wantMusic && this.volumes.music > 0) this.music?.start();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxOut || !this.musicOut) return;
    const t = this.ctx.currentTime;
    // curva quadrática: o controle fica mais natural ao ouvido
    this.sfxOut.gain.setTargetAtTime(this.volumes.sfx * this.volumes.sfx * 0.9, t, 0.03);
    this.musicOut.gain.setTargetAtTime(this.volumes.music * this.volumes.music * 0.8, t, 0.05);
    if (this.volumes.music === 0) this.music?.stop();
    else if (this.wantMusic) this.music?.start();
  }

  private live(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.sfxOut || this.volumes.sfx === 0) return null;
    return { ctx: this.ctx, out: this.sfxOut };
  }

  private tone(
    freq: number,
    dur: number,
    o: { type?: OscillatorType; gain?: number; delay?: number; glide?: number; attack?: number } = {},
  ): void {
    const a = this.live();
    if (!a) return;
    const t0 = a.ctx.currentTime + (o.delay ?? 0);
    const osc = a.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t0 + dur);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.25, t0 + (o.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, freq: number, q: number, gain: number): void {
    const a = this.live();
    if (!a || !this.noiseBuf) return;
    const t0 = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = a.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(a.out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  private marimba(freq: number, delay = 0, gain = 0.3): void {
    this.tone(freq, 0.45, { gain, delay, attack: 0.004 });
    this.tone(freq * 4, 0.1, { gain: gain * 0.18, delay });
  }

  /** "tic" de cerâmica ao pegar a peça */
  pick(): void {
    this.tone(1250, 0.07, { gain: 0.18 });
    this.tone(2500, 0.05, { gain: 0.05 });
  }

  /** peça encostando na casa */
  place(): void {
    this.noise(0.045, 2600, 2.5, 0.3);
    this.tone(820, 0.1, { type: 'triangle', gain: 0.18, glide: 620 });
  }

  /** acerto; com combo maior a nota sobe */
  correct(combo = 1): void {
    const lift = Math.pow(2, ((Math.min(combo, 4) - 1) * 2) / 12);
    this.marimba(659.25 * lift, 0);
    this.marimba(987.77 * lift, 0.075);
  }

  wrong(): void {
    this.tone(240, 0.22, { type: 'triangle', gain: 0.28, glide: 150 });
    this.tone(180, 0.26, { gain: 0.18, delay: 0.06, glide: 120 });
  }

  tick(high = false): void {
    this.tone(high ? 1046.5 : 784, 0.14, { gain: 0.22 });
  }

  comboUp(): void {
    [880, 1108.7, 1318.5].forEach((f, i) => this.tone(f, 0.12, { gain: 0.1, delay: i * 0.05, type: 'square' }));
  }

  star(i: number): void {
    const f = [783.99, 987.77, 1174.66][i] ?? 1174.66;
    this.marimba(f, 0, 0.3);
    this.tone(f * 2, 0.3, { gain: 0.06, delay: 0.02 });
  }

  /** vitória: arpejo maior com acorde final */
  fanfare(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.marimba(f, i * 0.09, 0.26));
    [523.25, 659.25, 783.99].forEach((f) => this.tone(f, 0.9, { type: 'triangle', gain: 0.08, delay: 0.38, attack: 0.02 }));
  }

  fail(): void {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.18, delay: i * 0.13 }));
  }
}

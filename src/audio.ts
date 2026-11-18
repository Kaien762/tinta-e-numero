/** Sons sintetizados na hora (Web Audio): nenhum arquivo de áudio. */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  constructor() {
    try {
      this.enabled = localStorage.getItem('tinta.som') !== '0';
    } catch {
      /* sem armazenamento: som ligado */
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem('tinta.som', on ? '1' : '0');
    } catch {
      /* ignora */
    }
    if (on) this.unlock();
  }

  /** Precisa ser chamado dentro de um gesto do usuário (política dos navegadores). */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const out = ctx.createGain();
      out.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      out.connect(comp);
      comp.connect(ctx.destination);
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.out = out;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private live(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled || !this.ctx || !this.out) return null;
    return { ctx: this.ctx, out: this.out };
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

  correct(): void {
    this.marimba(659.25, 0);
    this.marimba(987.77, 0.075);
  }

  wrong(): void {
    this.tone(240, 0.22, { type: 'triangle', gain: 0.28, glide: 150 });
    this.tone(180, 0.26, { gain: 0.18, delay: 0.06, glide: 120 });
  }

  tick(high = false): void {
    this.tone(high ? 1046.5 : 784, 0.14, { gain: 0.22 });
  }

  finish(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.marimba(f, i * 0.09, 0.26));
  }
}

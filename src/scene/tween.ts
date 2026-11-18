export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

interface Tween {
  key: unknown;
  start: number;
  duration: number;
  ease: Ease;
  update: (t: number) => void;
  done?: () => void;
  dead: boolean;
}

export interface TweenOptions {
  /** Tweens com a mesma chave podem ser cancelados juntos (ex.: tudo o que move uma peça). */
  key?: unknown;
  duration: number;
  delay?: number;
  ease?: Ease;
  update?: (t: number) => void;
  done?: () => void;
}

/** Animações curtas dirigidas pelo laço de quadros. */
export class Tweens {
  private list: Tween[] = [];

  add(o: TweenOptions): void {
    this.list.push({
      key: o.key,
      start: performance.now() + (o.delay ?? 0),
      duration: Math.max(1, o.duration),
      ease: o.ease ?? ease.outCubic,
      update: o.update ?? (() => undefined),
      done: o.done,
      dead: false,
    });
  }

  cancel(key: unknown): void {
    for (const t of this.list) if (t.key === key) t.dead = true;
  }

  update(now: number): void {
    for (const tw of this.list.slice()) {
      if (tw.dead || now < tw.start) continue;
      const t = Math.min(1, (now - tw.start) / tw.duration);
      tw.update(tw.ease(t));
      if (t >= 1) {
        tw.dead = true;
        tw.done?.();
      }
    }
    this.list = this.list.filter((t) => !t.dead);
  }
}

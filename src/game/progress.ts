import { PHASES } from './levels';

/** Progresso do jogador, guardado no navegador. */
export interface Progress {
  tutorialDone: boolean;
  /** Melhor número de estrelas por fase (0 = não concluída). */
  stars: number[];
  /** Melhor tempo por fase (ms). */
  bestPhaseMs: (number | null)[];
  relampagoBest: number;
  desafioBestMs: number | null;
}

const KEY = 'tinta.progresso.v1';

export function emptyProgress(): Progress {
  return {
    tutorialDone: false,
    stars: PHASES.map(() => 0),
    bestPhaseMs: PHASES.map(() => null),
    relampagoBest: 0,
    desafioBestMs: null,
  };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Progress {
  const base = emptyProgress();
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      tutorialDone: !!p.tutorialDone,
      stars: base.stars.map((_, i) => clampStars(p.stars?.[i])),
      bestPhaseMs: base.bestPhaseMs.map((_, i) => (typeof p.bestPhaseMs?.[i] === 'number' ? p.bestPhaseMs[i] : null)),
      relampagoBest: typeof p.relampagoBest === 'number' ? p.relampagoBest : 0,
      desafioBestMs: typeof p.desafioBestMs === 'number' ? p.desafioBestMs : null,
    };
  } catch {
    return base;
  }
}

export function saveProgress(p: Progress, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento: o progresso vale só nesta aba */
  }
}

/** A fase `index` abre quando a anterior foi concluída. */
export function isUnlocked(p: Progress, index: number): boolean {
  return index === 0 || (p.stars[index - 1] ?? 0) > 0;
}

export function totalStars(p: Progress): number {
  return p.stars.reduce((a, b) => a + b, 0);
}

/** Registra uma fase vencida; devolve se as estrelas ou o tempo melhoraram. */
export function recordPhase(p: Progress, index: number, stars: number, timeMs: number): { betterStars: boolean; betterTime: boolean } {
  const betterStars = stars > (p.stars[index] ?? 0);
  const prev = p.bestPhaseMs[index];
  const betterTime = prev === null || prev === undefined || timeMs < prev;
  if (betterStars) p.stars[index] = stars;
  if (betterTime) p.bestPhaseMs[index] = timeMs;
  return { betterStars, betterTime };
}

function clampStars(v: unknown): number {
  return typeof v === 'number' ? Math.max(0, Math.min(3, Math.round(v))) : 0;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

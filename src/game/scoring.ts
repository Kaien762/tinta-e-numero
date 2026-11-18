/** Pontuação do Relâmpago. */
export const RELAMPAGO_MS = 60000;

/** Multiplicador pelo número de acertos seguidos. */
export function comboMultiplier(streak: number): number {
  if (streak >= 10) return 4;
  if (streak >= 6) return 3;
  if (streak >= 3) return 2;
  return 1;
}

export interface Points {
  readonly base: number;
  readonly speed: number;
  readonly mult: number;
  readonly total: number;
}

/**
 * 100 por acerto + até 100 de bônus de rapidez (cheio abaixo de 0,6 s, zero a partir de 3 s),
 * tudo vezes o combo.
 */
export function pointsFor(roundMs: number, streak: number): Points {
  const base = 100;
  const speed = Math.round(Math.max(0, Math.min(1, (3000 - roundMs) / 2400)) * 100);
  const mult = comboMultiplier(streak);
  return { base, speed, mult, total: (base + speed) * mult };
}

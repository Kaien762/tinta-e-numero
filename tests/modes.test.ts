import { describe, expect, it } from 'vitest';
import { PHASES, MAX_STARS, outOfLives, starsFor } from '../src/game/levels';
import { emptyProgress, isUnlocked, loadProgress, recordPhase, saveProgress, totalStars } from '../src/game/progress';
import { mulberry32, targetOf } from '../src/game/rules';
import { comboMultiplier, pointsFor } from '../src/game/scoring';
import { Session } from '../src/game/session';

describe('Relâmpago: pontos e combo', () => {
  it('combo sobe em 3, 6 e 10 acertos seguidos', () => {
    expect([1, 2, 3, 5, 6, 9, 10, 30].map(comboMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('bônus de rapidez vai de 100 (≤ 0,6 s) a 0 (≥ 3 s)', () => {
    expect(pointsFor(400, 1)).toEqual({ base: 100, speed: 100, mult: 1, total: 200 });
    expect(pointsFor(1800, 1).speed).toBe(50);
    expect(pointsFor(5000, 1).total).toBe(100);
    expect(pointsFor(5000, 6).total).toBe(300);
  });

  it('erro zera a sequência; Infinity nunca termina por rodadas', () => {
    const s = new Session({ mode: 'relampago', rounds: Infinity, rng: mulberry32(3) });
    for (let i = 0; i < 40; i++) {
      const r = s.attempt(s.stimulus.ink, targetOf(s.stimulus));
      expect(r.kind).toBe('correct');
    }
    expect(s.streak).toBe(40);
    expect(s.finished).toBe(false);
    const wrong = s.stimulus.ink === 'azul' ? 'verde' : 'azul';
    s.attempt(wrong, { col: wrong, row: s.stimulus.value });
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(40);
    s.end();
    expect(s.finished).toBe(true);
  });
});

describe('Jornada: fases', () => {
  it('fases ficam mais longas e a última é a mais dura', () => {
    expect(PHASES).toHaveLength(10);
    expect(MAX_STARS).toBe(30);
    for (let i = 1; i < PHASES.length; i++) expect(PHASES[i].rounds).toBeGreaterThanOrEqual(PHASES[i - 1].rounds);
    const last = PHASES[PHASES.length - 1];
    expect(last.lives).toBe(1);
    expect(last.flicker).toBe(true);
  });

  it('estrelas: concluir = 1, até 1 erro = 2, sem erro no tempo = 3', () => {
    const p = PHASES[1];
    expect(starsFor(p, 0, p.parMs - 1)).toBe(3);
    expect(starsFor(p, 0, p.parMs + 1)).toBe(2);
    expect(starsFor(p, 1, 1000)).toBe(2);
    expect(starsFor(p, 2, 1000)).toBe(1);
  });

  it('vidas: perde quando os erros chegam ao limite', () => {
    expect(outOfLives(PHASES[2], 2)).toBe(false);
    expect(outOfLives(PHASES[2], 3)).toBe(true);
    expect(outOfLives(PHASES[0], 99)).toBe(false);
  });

  it('tempo esgotado conta erro e troca o estímulo sem avançar a rodada', () => {
    let t = 0;
    const s = new Session({ mode: 'fase', rounds: 8, rng: mulberry32(9), now: () => t });
    const before = s.stimulus;
    t = 6500;
    expect(s.roundElapsedMs()).toBe(6500);
    s.skip();
    expect(s.errors).toBe(1);
    expect(s.round).toBe(1);
    expect(s.stimulus).not.toEqual(before);
    expect(s.roundElapsedMs()).toBe(0);
  });

  it('a fase neutra só gera fundo neutro', () => {
    const s = new Session({ mode: 'fase', rounds: 50, neutral: true, rng: mulberry32(1) });
    for (let i = 0; i < 49; i++) {
      expect(s.stimulus.background).toBe('neutro');
      s.attempt(s.stimulus.ink, targetOf(s.stimulus));
    }
  });
});

describe('progresso salvo', () => {
  it('desbloqueia a próxima fase e guarda o melhor resultado', () => {
    const p = emptyProgress();
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
    expect(recordPhase(p, 0, 2, 20000)).toEqual({ betterStars: true, betterTime: true });
    expect(isUnlocked(p, 1)).toBe(true);
    expect(recordPhase(p, 0, 1, 25000)).toEqual({ betterStars: false, betterTime: false });
    expect(p.stars[0]).toBe(2);
    expect(totalStars(p)).toBe(2);
  });

  it('lê e grava; dado corrompido volta ao começo', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const p = emptyProgress();
    p.tutorialDone = true;
    p.relampagoBest = 4200;
    p.stars[0] = 3;
    saveProgress(p, store);
    expect(loadProgress(store)).toEqual(p);
    mem.set('tinta.progresso.v1', '{quebrado');
    expect(loadProgress(store)).toEqual(emptyProgress());
  });
});

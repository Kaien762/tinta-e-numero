import { describe, expect, it } from 'vitest';
import {
  COLORS,
  HOME,
  VALUES,
  atCell,
  generateStimulus,
  isAt,
  isCorrectMove,
  mulberry32,
  targetOf,
  type Cell,
  type ColorId,
  type Position,
  type Stimulus,
} from '../src/game/rules';
import { Session } from '../src/game/session';

const allCells: Cell[] = COLORS.flatMap((col) => VALUES.map((row) => ({ col, row })));

/** Todas as jogadas (peça, casa) que o jogo aceita para um estímulo. */
function acceptedMoves(s: Stimulus): string[] {
  const ok: string[] = [];
  for (const piece of COLORS) {
    for (const cell of allCells) {
      if (isCorrectMove(s, piece, cell)) ok.push(`${piece}@${cell.col}${cell.row}`);
    }
  }
  return ok;
}

describe('DOIS em verde', () => {
  it('fundo amarelo: só aceita a peça verde na casa 2 da coluna verde', () => {
    expect(acceptedMoves({ value: 2, ink: 'verde', background: 'amarelo' })).toEqual(['verde@verde2']);
  });

  it('fundo vermelho: aceita exatamente a mesma jogada', () => {
    expect(acceptedMoves({ value: 2, ink: 'verde', background: 'vermelho' })).toEqual(['verde@verde2']);
  });

  it('as distrações comuns são recusadas', () => {
    const s: Stimulus = { value: 2, ink: 'verde', background: 'amarelo' };
    expect(isCorrectMove(s, 'amarelo', { col: 'amarelo', row: 2 })).toBe(false); // seguiu o fundo
    expect(isCorrectMove(s, 'verde', { col: 'verde', row: 3 })).toBe(false); // número errado
    expect(isCorrectMove(s, 'verde', { col: 'amarelo', row: 2 })).toBe(false); // coluna errada
    expect(isCorrectMove(s, 'amarelo', { col: 'verde', row: 2 })).toBe(false); // peça errada na casa certa
  });

  it('o fundo nunca muda a resposta', () => {
    for (const ink of COLORS) {
      for (const value of VALUES) {
        const expected = acceptedMoves({ value, ink, background: 'neutro' });
        expect(expected).toEqual([`${ink}@${ink}${value}`]);
        for (const background of COLORS) {
          expect(acceptedMoves({ value, ink, background })).toEqual(expected);
        }
      }
    }
  });
});

describe('sorteio de estímulos', () => {
  it('nunca pede a casa onde a peça já está, nunca repete o alvo e nunca põe fundo da cor das letras', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const positions = {} as Record<ColorId, Position>;
      for (const c of COLORS) {
        positions[c] = rng() < 0.3 ? HOME : atCell({ col: c, row: VALUES[Math.floor(rng() * 4)] });
      }
      const previous = i % 3 === 0 ? null : generateStimulus(rng, positions, null);
      const s = generateStimulus(rng, positions, previous);
      expect(isAt(positions[s.ink], targetOf(s))).toBe(false);
      expect(s.background).not.toBe(s.ink);
      if (previous) {
        expect(`${s.ink}${s.value}`).not.toBe(`${previous.ink}${previous.value}`);
      }
    }
  });
});

describe('partida', () => {
  const clock = () => {
    let t = 1000;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };

  it('erro conta tentativa, não move a peça e mantém o estímulo', () => {
    const s = new Session({ mode: 'treino', rounds: 10, script: [{ value: 2, ink: 'verde', background: 'amarelo' }] });
    const before = s.stimulus;
    const r = s.attempt('amarelo', { col: 'amarelo', row: 2 });
    expect(r.kind).toBe('wrong');
    expect(s.errors).toBe(1);
    expect(s.positions.amarelo).toEqual(HOME);
    expect(s.stimulus).toBe(before);
    expect(s.round).toBe(1);

    const ok = s.attempt('verde', { col: 'verde', row: 2 });
    expect(ok).toEqual({ kind: 'correct', finished: false, completedRound: 1 });
    expect(s.positions.verde).toEqual(atCell({ col: 'verde', row: 2 }));
    expect(s.round).toBe(2);
  });

  it('soltar a peça na casa em que ela já está não conta como tentativa', () => {
    const s = new Session({
      mode: 'treino',
      rounds: 10,
      script: [
        { value: 1, ink: 'azul', background: 'verde' },
        { value: 3, ink: 'azul', background: 'vermelho' },
      ],
    });
    s.attempt('azul', { col: 'azul', row: 1 });
    expect(s.attempt('azul', { col: 'azul', row: 1 }).kind).toBe('noop');
    expect(s.errors).toBe(0);
  });

  it('dez rodadas, cronômetro para no fim e reiniciar zera tudo', () => {
    const c = clock();
    const s = new Session({ mode: 'desafio', rounds: 10, rng: mulberry32(42), now: c.now });
    s.attempt('vermelho', { col: 'amarelo', row: 4 }); // pode até ser certa por acaso; garantimos um erro abaixo
    s.reset();
    expect(s.errors).toBe(0);

    const wrongPiece = COLORS.find((x) => x !== s.stimulus.ink)!;
    s.attempt(wrongPiece, { col: wrongPiece, row: s.stimulus.value });
    expect(s.errors).toBe(1);

    for (let i = 0; i < 10; i++) {
      c.advance(1500);
      const t = targetOf(s.stimulus);
      expect(isAt(s.positions[s.stimulus.ink], t)).toBe(false);
      const r = s.attempt(s.stimulus.ink, t);
      expect(r.kind).toBe('correct');
    }
    expect(s.finished).toBe(true);
    expect(s.elapsedMs()).toBe(15000);
    c.advance(5000);
    expect(s.elapsedMs()).toBe(15000); // parado
    expect(s.attempt('azul', { col: 'azul', row: 1 }).kind).toBe('noop');

    s.reset();
    expect(s.finished).toBe(false);
    expect(s.round).toBe(1);
    expect(s.errors).toBe(0);
    expect(s.elapsedMs()).toBe(0);
    for (const col of COLORS) expect(s.positions[col]).toEqual(HOME);
  });
});

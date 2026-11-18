export type ColorId = 'vermelho' | 'amarelo' | 'verde' | 'azul';
export const COLORS: readonly ColorId[] = ['vermelho', 'amarelo', 'verde', 'azul'];

export type Value = 1 | 2 | 3 | 4;
export const VALUES: readonly Value[] = [1, 2, 3, 4];

export const WORDS: Readonly<Record<Value, string>> = { 1: 'UM', 2: 'DOIS', 3: 'TRÊS', 4: 'QUATRO' };

/** Cor do fundo do painel. "neutro" só aparece na primeira rodada do tutorial. */
export type Background = ColorId | 'neutro';

export interface Stimulus {
  readonly value: Value;
  readonly ink: ColorId;
  readonly background: Background;
}

export interface Cell {
  readonly col: ColorId;
  readonly row: Value;
}

export type Position =
  | { readonly kind: 'home' }
  | { readonly kind: 'cell'; readonly col: ColorId; readonly row: Value };

export const HOME: Position = { kind: 'home' };

export const atCell = (cell: Cell): Position => ({ kind: 'cell', col: cell.col, row: cell.row });

export const isAt = (pos: Position, cell: Cell): boolean =>
  pos.kind === 'cell' && pos.col === cell.col && pos.row === cell.row;

export const sameCell = (a: Cell | null, b: Cell | null): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;

export const targetOf = (s: Stimulus): Cell => ({ col: s.ink, row: s.value });

/**
 * A regra inteira do jogo: valem só o número escrito e a cor das letras.
 * O fundo do painel nunca entra na conta.
 */
export function isCorrectMove(s: Stimulus, piece: ColorId, cell: Cell): boolean {
  return piece === s.ink && cell.col === s.ink && cell.row === s.value;
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Sorteia o próximo estímulo.
 * - nunca pede uma casa onde a peça da rodada já está (a jogada precisa ser confirmada);
 * - não repete o alvo da rodada anterior;
 * - o fundo nunca tem a cor das letras e, se der, muda em relação à rodada anterior.
 */
export function generateStimulus(
  rng: Rng,
  positions: Readonly<Record<ColorId, Position>>,
  previous: Stimulus | null,
): Stimulus {
  const candidates: Cell[] = [];
  for (const ink of COLORS) {
    for (const value of VALUES) {
      const cell: Cell = { col: ink, row: value };
      if (isAt(positions[ink], cell)) continue;
      if (previous && previous.ink === ink && previous.value === value) continue;
      candidates.push(cell);
    }
  }
  const target = pick(rng, candidates);
  const others = COLORS.filter((c) => c !== target.col);
  const fresh = others.filter((c) => !previous || c !== previous.background);
  const background = pick(rng, fresh.length > 0 ? fresh : others);
  return { value: target.row, ink: target.col, background };
}

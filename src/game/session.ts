import {
  COLORS,
  HOME,
  atCell,
  generateStimulus,
  isAt,
  isCorrectMove,
  type Cell,
  type ColorId,
  type Position,
  type Rng,
  type Stimulus,
} from './rules';

export type Mode = 'tutorial' | 'treino' | 'desafio';

export interface SessionOptions {
  readonly mode: Mode;
  readonly rounds: number;
  /** Estímulos fixos por rodada (o tutorial usa isto). */
  readonly script?: readonly Stimulus[];
  readonly rng?: Rng;
  readonly now?: () => number;
}

export type AttemptResult =
  | { readonly kind: 'noop' }
  | { readonly kind: 'wrong'; readonly from: Position; readonly errors: number }
  | { readonly kind: 'correct'; readonly finished: boolean; readonly completedRound: number };

/** Estado de uma partida, sem nada de tela. */
export class Session {
  readonly mode: Mode;
  readonly totalRounds: number;
  round = 1;
  errors = 0;
  finished = false;
  startedAt = 0;
  endedAt: number | null = null;
  positions: Record<ColorId, Position> = homePositions();
  stimulus: Stimulus;

  private readonly script: readonly Stimulus[];
  private readonly rng: Rng;
  private readonly now: () => number;

  constructor(options: SessionOptions) {
    this.mode = options.mode;
    this.totalRounds = options.rounds;
    this.script = options.script ?? [];
    this.rng = options.rng ?? Math.random;
    this.now = options.now ?? (() => performance.now());
    this.stimulus = this.nextStimulus(null);
    this.reset();
  }

  /** Zera cronômetro, tentativas e posições. */
  reset(): void {
    this.positions = homePositions();
    this.round = 1;
    this.errors = 0;
    this.finished = false;
    this.endedAt = null;
    this.startedAt = this.now();
    this.stimulus = this.nextStimulus(null);
  }

  attempt(piece: ColorId, cell: Cell): AttemptResult {
    if (this.finished) return { kind: 'noop' };
    const from = this.positions[piece];
    if (isAt(from, cell)) return { kind: 'noop' };

    if (!isCorrectMove(this.stimulus, piece, cell)) {
      this.errors += 1;
      return { kind: 'wrong', from, errors: this.errors };
    }

    this.positions = { ...this.positions, [piece]: atCell(cell) };
    const completedRound = this.round;
    if (this.round >= this.totalRounds) {
      this.finished = true;
      this.endedAt = this.now();
    } else {
      this.round += 1;
      this.stimulus = this.nextStimulus(this.stimulus);
    }
    return { kind: 'correct', finished: this.finished, completedRound };
  }

  elapsedMs(): number {
    return (this.endedAt ?? this.now()) - this.startedAt;
  }

  occupantOf(cell: Cell): ColorId | null {
    return COLORS.find((c) => isAt(this.positions[c], cell)) ?? null;
  }

  /** Usado pelos testes e pelo modo de depuração. */
  setStimulus(s: Stimulus): void {
    this.stimulus = s;
  }

  private nextStimulus(previous: Stimulus | null): Stimulus {
    return this.script[this.round - 1] ?? generateStimulus(this.rng, this.positions, previous);
  }
}

function homePositions(): Record<ColorId, Position> {
  return { vermelho: HOME, amarelo: HOME, verde: HOME, azul: HOME };
}

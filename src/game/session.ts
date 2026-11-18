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

export type Mode = 'tutorial' | 'treino' | 'desafio' | 'fase' | 'relampago';

export interface SessionOptions {
  readonly mode: Mode;
  /** Rodadas para terminar. `Infinity` = só termina por tempo (Relâmpago). */
  readonly rounds: number;
  /** Estímulos fixos por rodada (o tutorial usa isto). */
  readonly script?: readonly Stimulus[];
  /** Fundo sempre neutro (primeira fase). */
  readonly neutral?: boolean;
  readonly rng?: Rng;
  readonly now?: () => number;
}

export type AttemptResult =
  | { readonly kind: 'noop' }
  | { readonly kind: 'wrong'; readonly from: Position; readonly errors: number }
  | {
      readonly kind: 'correct';
      readonly finished: boolean;
      readonly completedRound: number;
      /** Quanto tempo a rodada levou (ms). */
      readonly roundMs: number;
      /** Acertos seguidos, contando este. */
      readonly streak: number;
    };

/** Estado de uma partida, sem nada de tela. */
export class Session {
  readonly mode: Mode;
  readonly totalRounds: number;
  round = 1;
  errors = 0;
  correct = 0;
  streak = 0;
  bestStreak = 0;
  finished = false;
  startedAt = 0;
  roundStartedAt = 0;
  endedAt: number | null = null;
  positions: Record<ColorId, Position> = homePositions();
  stimulus: Stimulus;

  private readonly script: readonly Stimulus[];
  private readonly neutral: boolean;
  private readonly rng: Rng;
  private readonly now: () => number;

  constructor(options: SessionOptions) {
    this.mode = options.mode;
    this.totalRounds = options.rounds;
    this.script = options.script ?? [];
    this.neutral = options.neutral ?? false;
    this.rng = options.rng ?? Math.random;
    this.now = options.now ?? (() => performance.now());
    this.stimulus = this.nextStimulus(null);
    this.reset();
  }

  /** Zera cronômetro, tentativas, sequência e posições. */
  reset(): void {
    this.positions = homePositions();
    this.round = 1;
    this.errors = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.finished = false;
    this.endedAt = null;
    this.startedAt = this.now();
    this.roundStartedAt = this.startedAt;
    this.stimulus = this.nextStimulus(null);
  }

  attempt(piece: ColorId, cell: Cell): AttemptResult {
    if (this.finished) return { kind: 'noop' };
    const from = this.positions[piece];
    if (isAt(from, cell)) return { kind: 'noop' };

    if (!isCorrectMove(this.stimulus, piece, cell)) {
      this.errors += 1;
      this.streak = 0;
      return { kind: 'wrong', from, errors: this.errors };
    }

    const now = this.now();
    const roundMs = now - this.roundStartedAt;
    this.positions = { ...this.positions, [piece]: atCell(cell) };
    this.correct += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const completedRound = this.round;
    if (this.round >= this.totalRounds) {
      this.finished = true;
      this.endedAt = now;
    } else {
      this.round += 1;
      this.stimulus = this.nextStimulus(this.stimulus);
      this.roundStartedAt = now;
    }
    return { kind: 'correct', finished: this.finished, completedRound, roundMs, streak: this.streak };
  }

  /** Tempo da rodada esgotado: conta como erro e troca o estímulo, sem avançar a rodada. */
  skip(): void {
    if (this.finished) return;
    this.errors += 1;
    this.streak = 0;
    this.stimulus = this.nextStimulus(this.stimulus);
    this.roundStartedAt = this.now();
  }

  /** Encerra a partida por fora (tempo do Relâmpago, vidas da fase). */
  end(): void {
    if (this.finished) return;
    this.finished = true;
    this.endedAt = this.now();
  }

  elapsedMs(): number {
    return (this.endedAt ?? this.now()) - this.startedAt;
  }

  roundElapsedMs(): number {
    return (this.endedAt ?? this.now()) - this.roundStartedAt;
  }

  occupantOf(cell: Cell): ColorId | null {
    return COLORS.find((c) => isAt(this.positions[c], cell)) ?? null;
  }

  /** Usado pelos testes e pelo modo de depuração. */
  setStimulus(s: Stimulus): void {
    this.stimulus = s;
  }

  private nextStimulus(previous: Stimulus | null): Stimulus {
    const scripted = this.script[this.round - 1];
    if (scripted) return scripted;
    const s = generateStimulus(this.rng, this.positions, previous);
    return this.neutral ? { ...s, background: 'neutro' } : s;
  }
}

function homePositions(): Record<ColorId, Position> {
  return { vermelho: HOME, amarelo: HOME, verde: HOME, azul: HOME };
}

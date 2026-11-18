/** Fases da Jornada: cada uma acrescenta uma dificuldade. */
export interface Phase {
  readonly id: number;
  readonly name: string;
  /** O que muda nesta fase (aparece na tela de abertura). */
  readonly twist: string;
  readonly rounds: number;
  /** Fundo sempre neutro. */
  readonly neutral: boolean;
  /** Tempo máximo por rodada; ao esgotar conta como erro e o estímulo troca. */
  readonly roundTimeMs: number | null;
  /** Erros permitidos antes de perder a fase (null = sem limite). */
  readonly lives: number | null;
  /** O fundo troca de cor sozinho durante a rodada. */
  readonly flicker: boolean;
  /** Tempo para a 3ª estrela (junto com zero erros). */
  readonly parMs: number;
}

export const PHASES: readonly Phase[] = [
  { id: 1, name: 'Primeiros passos', twist: 'Fundo neutro: só a palavra e a cor das letras.', rounds: 5, neutral: true, roundTimeMs: null, lives: null, flicker: false, parMs: 15000 },
  { id: 2, name: 'Fundo colorido', twist: 'Agora o fundo tem cor. Não se deixe levar!', rounds: 6, neutral: false, roundTimeMs: null, lives: null, flicker: false, parMs: 16000 },
  { id: 3, name: 'Três vidas', twist: 'Três erros e a fase acaba.', rounds: 7, neutral: false, roundTimeMs: null, lives: 3, flicker: false, parMs: 17000 },
  { id: 4, name: 'No ritmo', twist: 'Cada rodada tem 6 segundos. Acabou o tempo, conta erro.', rounds: 8, neutral: false, roundTimeMs: 6000, lives: 3, flicker: false, parMs: 18000 },
  { id: 5, name: 'Pisca-pisca', twist: 'O fundo troca de cor sem parar. As letras, não.', rounds: 8, neutral: false, roundTimeMs: null, lives: 3, flicker: true, parMs: 18000 },
  { id: 6, name: 'Apertando o passo', twist: '4,5 segundos por rodada.', rounds: 9, neutral: false, roundTimeMs: 4500, lives: 3, flicker: false, parMs: 18500 },
  { id: 7, name: 'Pisca no ritmo', twist: 'Fundo piscando e relógio correndo.', rounds: 9, neutral: false, roundTimeMs: 5000, lives: 3, flicker: true, parMs: 19000 },
  { id: 8, name: 'Duas vidas', twist: 'Só dois erros e 4 segundos por rodada.', rounds: 10, neutral: false, roundTimeMs: 4000, lives: 2, flicker: false, parMs: 19500 },
  { id: 9, name: 'Olho vivo', twist: 'Pisca-pisca, 3,8 segundos e duas vidas.', rounds: 10, neutral: false, roundTimeMs: 3800, lives: 2, flicker: true, parMs: 20000 },
  { id: 10, name: 'Mestre da tinta', twist: 'Doze rodadas, 3,2 segundos, uma vida. Boa sorte!', rounds: 12, neutral: false, roundTimeMs: 3200, lives: 1, flicker: true, parMs: 23000 },
];

export const MAX_STARS = PHASES.length * 3;

/** 1 estrela: concluir. 2: até 1 erro. 3: sem erros e dentro do tempo-alvo. */
export function starsFor(phase: Phase, errors: number, timeMs: number): 1 | 2 | 3 {
  if (errors === 0 && timeMs <= phase.parMs) return 3;
  if (errors <= 1) return 2;
  return 1;
}

/** Perdeu a fase quando os erros chegam ao número de vidas. */
export function outOfLives(phase: Phase, errors: number): boolean {
  return phase.lives !== null && errors >= phase.lives;
}

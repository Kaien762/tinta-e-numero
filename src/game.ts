import type { Sfx } from './audio';
import { PALETTE } from './game/palette';
import { WORDS, targetOf, type Cell, type ColorId, type Stimulus } from './game/rules';
import { Session, type AttemptResult, type Mode } from './game/session';
import type { World } from './scene/world';
import { pill, type UI } from './ui';

type PlayMode = Exclude<Mode, 'tutorial'>;
export type Phase = 'start' | 'tutorial' | 'mode' | 'countdown' | 'playing' | 'end';

export const ROUNDS = 10;

/** Rodada 1: fundo neutro. Rodada 2: o exemplo obrigatório, DOIS em verde sobre amarelo. */
export const TUTORIAL_SCRIPT: readonly Stimulus[] = [
  { value: 3, ink: 'azul', background: 'neutro' },
  { value: 2, ink: 'verde', background: 'amarelo' },
];

const b = (s: string | number) => `<b>${s}</b>`;
const RULE = `<span class="rule"><b>Palavra</b> → número da casa <span class="dot">·</span> <b>Cor das letras</b> → peça e coluna</span>`;

/** Liga as regras (Session) à mesa 3D (World) e à interface (UI). */
export class Game {
  phase: Phase = 'start';
  session: Session | null = null;
  mode: PlayMode = 'treino';

  private readonly ui: UI;
  private readonly world: World;
  private readonly sfx: Sfx;
  private held: ColorId | null = null;
  private hintsOn = false;
  private timers: number[] = [];

  constructor(ui: UI, world: World, sfx: Sfx) {
    this.ui = ui;
    this.world = world;
    this.sfx = sfx;
    ui.setSound(sfx.enabled);
    ui.bind({
      start: () => this.startTutorial(),
      tutorial: () => this.startTutorial(),
      treino: () => this.startMode('treino'),
      desafio: () => this.startMode('desafio'),
      replay: () => this.startMode(this.mode),
      changeMode: () => this.showModeSelect(false),
      sound: (on) => sfx.setEnabled(on),
    });
    ui.showGame(false);
    ui.showScreen('start');
  }

  // ------------------------------------------------------------ fluxo

  startTutorial(): void {
    this.clearTimers();
    this.phase = 'tutorial';
    this.session = new Session({ mode: 'tutorial', rounds: TUTORIAL_SCRIPT.length, script: TUTORIAL_SCRIPT });
    this.world.resetPieces(true);
    this.ui.showScreen(null);
    this.ui.showGame(true);
    this.presentRound();
    this.world.enabled = true;
  }

  startMode(mode: PlayMode): void {
    this.clearTimers();
    this.mode = mode;
    this.world.enabled = false;
    this.world.setHint(null, null);
    this.world.resetPieces(true);
    this.ui.showScreen(null);
    this.ui.showGame(true);
    this.session = null;
    this.ui.setStimulus(null);
    this.ui.setHud({ mode, round: 1, total: ROUNDS, errors: 0 });
    this.ui.setTimer(0);
    this.ui.setCoach(RULE, false);
    if (mode === 'desafio') {
      this.phase = 'countdown';
      const steps = ['3', '2', '1', 'Já!'];
      steps.forEach((label, i) =>
        this.later(i * 600, () => {
          this.ui.showCountdown(label);
          this.sfx.tick(i === steps.length - 1);
        }),
      );
      this.later(steps.length * 600 - 250, () => {
        this.ui.showCountdown(null);
        this.beginRounds(mode);
      });
    } else {
      this.beginRounds(mode);
    }
  }

  private beginRounds(mode: PlayMode): void {
    // o cronômetro começa aqui, junto com o primeiro estímulo
    this.session = new Session({ mode, rounds: ROUNDS });
    this.phase = 'playing';
    this.presentRound();
    this.world.enabled = true;
  }

  private showModeSelect(afterTutorial: boolean): void {
    this.clearTimers();
    this.phase = 'mode';
    this.world.enabled = false;
    this.world.select(null);
    this.world.setHint(null, null);
    this.ui.showScreen('mode', { afterTutorial });
  }

  private finish(): void {
    const s = this.session;
    if (!s) return;
    this.phase = 'end';
    this.world.enabled = false;
    this.world.select(null);
    this.ui.setTimer(s.elapsedMs());
    this.later(650, () => {
      this.sfx.finish();
      this.ui.setEndStats({ mode: this.mode, timeMs: s.elapsedMs(), errors: s.errors, rounds: s.totalRounds });
      this.ui.showScreen('end');
    });
  }

  private presentRound(): void {
    const s = this.session;
    if (!s) return;
    this.ui.setStimulus(s.stimulus);
    this.ui.setHud({ mode: s.mode, round: s.round, total: s.totalRounds, errors: s.errors });
    if (s.mode !== 'tutorial') {
      this.ui.setCoach(RULE, false);
      return;
    }
    this.ui.setCoach(this.tutorialIntro(s.round, s.stimulus), true);
    // 1ª rodada: dica na hora. 2ª: deixa tentar e só mostra a dica depois de um tempo ou de um erro.
    this.hintsOn = s.round === 1;
    if (!this.hintsOn) {
      const round = s.round;
      this.later(4500, () => {
        if (this.phase === 'tutorial' && this.session?.round === round) {
          this.hintsOn = true;
          this.refreshHints();
        }
      });
    }
    this.refreshHints();
  }

  // ------------------------------------------------------------ ganchos do World

  resolve(piece: ColorId, cell: Cell): AttemptResult {
    const s = this.session;
    if (!s || (this.phase !== 'tutorial' && this.phase !== 'playing')) return { kind: 'noop' };
    const stim = s.stimulus;
    const r = s.attempt(piece, cell);
    if (r.kind === 'correct') {
      if (s.mode === 'tutorial') {
        if (r.finished) {
          this.phase = 'mode';
          this.world.enabled = false;
          this.world.setHint(null, null);
          this.ui.setCoach('Muito bem! Você leu a palavra e seguiu a cor das letras, não a do fundo.', true);
          this.later(900, () => this.showModeSelect(true));
        } else {
          this.ui.showToast('Isso mesmo!', 'good');
          this.presentRound();
        }
      } else if (r.finished) {
        this.ui.setHud({ mode: s.mode, round: s.round, total: s.totalRounds, errors: s.errors });
        this.finish();
      } else {
        this.presentRound();
      }
    } else if (r.kind === 'wrong' && s.mode === 'tutorial') {
      this.hintsOn = true;
      this.ui.setCoach(this.explain(stim, piece, cell), true);
      this.refreshHints();
    }
    return r;
  }

  landed(result: AttemptResult): void {
    const s = this.session;
    if (result.kind === 'correct') {
      this.sfx.correct();
      return;
    }
    if (result.kind !== 'wrong' || !s) return;
    this.sfx.wrong();
    this.ui.flashError();
    this.ui.setHud({ mode: s.mode, round: s.round, total: s.totalRounds, errors: s.errors });
    if (s.mode !== 'tutorial') this.ui.bumpErrors();
  }

  onHold(piece: ColorId | null): void {
    this.held = piece;
    const s = this.session;
    if (this.phase === 'tutorial' && s && piece && piece === s.stimulus.ink) {
      const ink = PALETTE[piece];
      this.ui.setCoach(`Isso, é a peça ${ink.name}! Agora leve até a casa ${b(s.stimulus.value)} da coluna ${ink.name}.`, true);
    }
    this.refreshHints();
  }

  frame(): void {
    if (this.phase === 'playing' && this.session?.mode === 'desafio') this.ui.setTimer(this.session.elapsedMs());
  }

  // ------------------------------------------------------------ tutorial

  private refreshHints(): void {
    const s = this.session;
    if (this.phase !== 'tutorial' || !s || !this.hintsOn) {
      this.world.setHint(null, null);
      return;
    }
    if (this.held === s.stimulus.ink) this.world.setHint(null, targetOf(s.stimulus));
    else this.world.setHint(s.stimulus.ink, null);
  }

  private tutorialIntro(round: number, s: Stimulus): string {
    const ink = PALETTE[s.ink];
    const word = WORDS[s.value];
    if (round === 1 || s.background === 'neutro') {
      return `A palavra é ${b(word)} e as letras são ${pill(s.ink, ink.plural)}. Leve a peça ${ink.name} até a casa ${b(s.value)} da coluna ${ink.name}.`;
    }
    const bg = PALETTE[s.background];
    return `Agora o fundo é ${pill(s.background, bg.name)}, mas ele só distrai. Letras ${pill(s.ink, ink.plural)} e ${b(word)}: peça ${ink.name} na casa ${b(s.value)} da coluna ${ink.name}.`;
  }

  private explain(s: Stimulus, piece: ColorId, cell: Cell): string {
    const ink = PALETTE[s.ink];
    if (piece !== s.ink) {
      if (s.background !== 'neutro' && piece === s.background) {
        return `Cuidado: ${PALETTE[piece].name} é só o fundo! As letras são ${pill(s.ink, ink.plural)}. Use a peça ${ink.name}.`;
      }
      return `Olhe a cor das letras: elas são ${pill(s.ink, ink.plural)}. Use a peça ${ink.name}.`;
    }
    if (cell.row !== s.value) {
      return `A peça está certa, mas a palavra é ${b(WORDS[s.value])}: solte na casa ${b(s.value)}.`;
    }
    return `Quase! A peça ${ink.name} fica na coluna ${ink.name}, a do símbolo ${pill(s.ink, ink.symbolName)}.`;
  }

  // ------------------------------------------------------------ util

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.ui.showCountdown(null);
  }
}

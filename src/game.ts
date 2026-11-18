import type { Sfx } from './audio';
import { PHASES, outOfLives, starsFor, type Phase } from './game/levels';
import { PALETTE } from './game/palette';
import { loadProgress, recordPhase, saveProgress, type Progress } from './game/progress';
import { WORDS, targetOf, type Cell, type ColorId, type Stimulus } from './game/rules';
import { RELAMPAGO_MS, comboMultiplier, pointsFor } from './game/scoring';
import { Session, type AttemptResult } from './game/session';
import type { World } from './scene/world';
import { formatPoints, formatTime, pill, type HudState, type UI } from './ui';

export type Phase_ = 'menu' | 'tutorial' | 'countdown' | 'playing' | 'end';

type Run =
  | { kind: 'tutorial' }
  | { kind: 'classic'; mode: 'treino' | 'desafio' }
  | { kind: 'fase'; index: number; phase: Phase }
  | { kind: 'relampago' };

export const ROUNDS = 10;
const TEMPO_NORMAL = 116;
const TEMPO_RELAMPAGO = 126;
const TEMPO_FINAL = 142;

/** Rodada 1: fundo neutro. Rodada 2: o exemplo obrigatório, DOIS em verde sobre amarelo. */
export const TUTORIAL_SCRIPT: readonly Stimulus[] = [
  { value: 3, ink: 'azul', background: 'neutro' },
  { value: 2, ink: 'verde', background: 'amarelo' },
];

const b = (s: string | number) => `<b>${s}</b>`;
const RULE = `<span class="rule"><b>Palavra</b> → número da casa <span class="dot">·</span> <b>Cor das letras</b> → peça e coluna</span>`;

/** Liga as regras (Session) à mesa 3D (World) e à interface (UI), para todos os modos. */
export class Game {
  phase: Phase_ = 'menu';
  session: Session | null = null;
  run: Run = { kind: 'tutorial' };
  score = 0;
  progress: Progress = loadProgress();

  private readonly ui: UI;
  private readonly world: World;
  private readonly sfx: Sfx;
  private held: ColorId | null = null;
  private hintsOn = false;
  private timers: number[] = [];
  private classicMode: 'treino' | 'desafio' = 'treino';
  private phaseIndex = 0;

  constructor(ui: UI, world: World, sfx: Sfx) {
    this.ui = ui;
    this.world = world;
    this.sfx = sfx;
    ui.setVolumes(sfx.volumes);
    ui.bind({
      start: () => this.startTutorial(),
      tutorial: () => this.startTutorial(),
      jornada: () => this.showPhases(),
      relampago: () => this.startRelampago(),
      classico: () => this.toScreen('mode'),
      treino: () => this.startClassic('treino'),
      desafio: () => this.startClassic('desafio'),
      menu: () => this.showMenu(false),
      pickPhase: (i) => this.pickPhase(i),
      playPhase: () => this.playPhase(this.phaseIndex),
      nextPhase: () => this.pickPhase(this.phaseIndex + 1),
      retryPhase: () => this.playPhase(this.phaseIndex),
      phases: () => this.showPhases(),
      flashAgain: () => this.startRelampago(),
      replay: () => this.startClassic(this.classicMode),
      changeMode: () => this.toScreen('mode'),
      volumes: (v) => sfx.setVolumes(v),
    });
    ui.showGame(false);
    if (this.progress.tutorialDone) this.showMenu(false);
    else ui.showScreen('start');
  }

  // ------------------------------------------------------------ navegação

  showMenu(afterTutorial: boolean): void {
    this.stopRun();
    const best = this.progress.desafioBestMs;
    this.ui.showMenu(this.progress, best === null ? null : formatTime(best), afterTutorial);
  }

  private toScreen(name: 'mode'): void {
    this.stopRun();
    this.ui.showScreen(name);
  }

  private showPhases(): void {
    this.stopRun();
    this.ui.showPhases(this.progress);
  }

  private pickPhase(index: number): void {
    const phase = PHASES[index];
    if (!phase) return this.showPhases();
    this.stopRun();
    this.phaseIndex = index;
    this.ui.showPhaseIntro(phase, this.progress.stars[index] ?? 0);
  }

  /** Para tudo o que estiver rodando e deixa a mesa parada. */
  private stopRun(): void {
    this.clearTimers();
    this.phase = 'menu';
    this.world.enabled = false;
    this.world.select(null);
    this.world.setHint(null, null);
    this.ui.setStimulus(null);
    this.ui.setRoundBar(null);
    this.ui.showGame(false);
    this.sfx.setTempo(TEMPO_NORMAL);
  }

  // ------------------------------------------------------------ início das partidas

  startTutorial(): void {
    this.begin({ kind: 'tutorial' }, false);
  }

  startClassic(mode: 'treino' | 'desafio'): void {
    this.classicMode = mode;
    this.begin({ kind: 'classic', mode }, mode === 'desafio');
  }

  playPhase(index: number): void {
    const phase = PHASES[index];
    if (!phase) return;
    this.phaseIndex = index;
    this.begin({ kind: 'fase', index, phase }, true);
  }

  startRelampago(): void {
    this.begin({ kind: 'relampago' }, true);
  }

  private begin(run: Run, countdown: boolean): void {
    this.stopRun();
    this.run = run;
    this.score = 0;
    this.world.resetPieces(true);
    this.ui.showScreen(null);
    this.ui.showGame(true);
    this.session = null;
    this.ui.setTimer(run.kind === 'relampago' ? RELAMPAGO_MS : 0);
    this.ui.setCoach(run.kind === 'tutorial' ? '' : RULE, run.kind === 'tutorial');
    this.ui.setHud(this.hudFor(null));
    this.sfx.setTempo(run.kind === 'relampago' ? TEMPO_RELAMPAGO : TEMPO_NORMAL);
    if (!countdown) {
      this.startSession();
      return;
    }
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
      this.startSession();
    });
  }

  /** O cronômetro começa aqui, junto com o primeiro estímulo. */
  private startSession(): void {
    const run = this.run;
    this.session =
      run.kind === 'tutorial'
        ? new Session({ mode: 'tutorial', rounds: TUTORIAL_SCRIPT.length, script: TUTORIAL_SCRIPT })
        : run.kind === 'classic'
          ? new Session({ mode: run.mode, rounds: ROUNDS })
          : run.kind === 'fase'
            ? new Session({ mode: 'fase', rounds: run.phase.rounds, neutral: run.phase.neutral })
            : new Session({ mode: 'relampago', rounds: Infinity });
    this.phase = run.kind === 'tutorial' ? 'tutorial' : 'playing';
    this.presentRound();
    this.world.enabled = true;
  }

  private presentRound(): void {
    const s = this.session;
    if (!s) return;
    this.ui.setStimulus(s.stimulus, this.run.kind === 'fase' && this.run.phase.flicker);
    this.ui.setHud(this.hudFor(s));
    if (this.run.kind !== 'tutorial') return;
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

  private hudFor(s: Session | null): HudState {
    const run = this.run;
    const round = s?.round ?? 1;
    const errors = s?.errors ?? 0;
    switch (run.kind) {
      case 'tutorial':
        return { mode: 'tutorial', round, total: TUTORIAL_SCRIPT.length, errors, timer: false };
      case 'classic':
        return { mode: run.mode, round, total: ROUNDS, errors, timer: run.mode === 'desafio' };
      case 'fase':
        return { mode: 'fase', label: `Fase ${run.phase.id}`, round, total: run.phase.rounds, errors, lives: run.phase.lives, timer: true };
      case 'relampago':
        return { mode: 'relampago', round, total: Infinity, errors, score: this.score, combo: comboMultiplier(s?.streak ?? 0), timer: true };
    }
  }

  // ------------------------------------------------------------ ganchos do World

  resolve(piece: ColorId, cell: Cell): AttemptResult {
    const s = this.session;
    if (!s || (this.phase !== 'tutorial' && this.phase !== 'playing')) return { kind: 'noop' };
    const stim = s.stimulus;
    const r = s.attempt(piece, cell);
    const run = this.run;

    if (r.kind === 'correct') {
      if (run.kind === 'tutorial') {
        if (r.finished) {
          this.phase = 'end';
          this.world.enabled = false;
          this.world.setHint(null, null);
          this.ui.setCoach('Muito bem! Você leu a palavra e seguiu a cor das letras, não a do fundo.', true);
          this.progress.tutorialDone = true;
          saveProgress(this.progress);
          this.later(900, () => this.showMenu(true));
        } else {
          this.ui.showToast('Isso mesmo!', 'good');
          this.presentRound();
        }
      } else if (run.kind === 'relampago') {
        const pts = pointsFor(r.roundMs, r.streak);
        this.score += pts.total;
        const at = this.world.cellScreen(cell);
        this.ui.floatText(at.x, at.y - 30, `+${formatPoints(pts.total)}`, 'points');
        if (pts.mult > comboMultiplier(r.streak - 1)) {
          this.ui.floatText(at.x, at.y - 70, `COMBO x${pts.mult}!`, 'combo');
          this.ui.bumpCombo();
          this.sfx.comboUp();
        }
        this.ui.bumpScore();
        this.presentRound();
      } else if (r.finished) {
        this.ui.setHud(this.hudFor(s));
        this.finishRun();
      } else {
        this.presentRound();
      }
    } else if (r.kind === 'wrong') {
      if (run.kind === 'tutorial') {
        this.hintsOn = true;
        this.ui.setCoach(this.explain(stim, piece, cell), true);
        this.refreshHints();
      } else if (run.kind === 'fase' && outOfLives(run.phase, s.errors)) {
        this.failPhase();
      } else if (run.kind === 'relampago') {
        this.ui.setHud(this.hudFor(s));
      }
    }
    return r;
  }

  landed(result: AttemptResult, _piece: ColorId, cell: Cell): void {
    const s = this.session;
    if (result.kind === 'correct') {
      this.sfx.correct(this.run.kind === 'relampago' ? comboMultiplier(result.streak) : 1);
      return;
    }
    if (result.kind !== 'wrong' || !s) return;
    this.sfx.wrong();
    this.ui.flashError(this.run.kind === 'relampago' ? 'Ops! Combo zerado.' : undefined);
    if (this.run.kind === 'relampago' && s.streak === 0) {
      const at = this.world.cellScreen(cell);
      this.ui.floatText(at.x, at.y - 30, '✕', 'bad');
    }
    this.ui.setHud(this.hudFor(s));
    if (this.run.kind !== 'tutorial') this.ui.bumpErrors();
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
    const s = this.session;
    if (this.phase !== 'playing' || !s) return;
    const run = this.run;
    if (run.kind === 'relampago') {
      const left = RELAMPAGO_MS - s.elapsedMs();
      this.ui.setTimer(left, left < 10000);
      this.sfx.setTempo(left < 10000 ? TEMPO_FINAL : TEMPO_RELAMPAGO);
      if (left <= 0) this.endRelampago();
      return;
    }
    if (run.kind === 'classic' && run.mode === 'desafio') this.ui.setTimer(s.elapsedMs());
    if (run.kind === 'fase') {
      this.ui.setTimer(s.elapsedMs());
      const limit = run.phase.roundTimeMs;
      if (limit) {
        const used = s.roundElapsedMs();
        this.ui.setRoundBar(1 - used / limit);
        if (used >= limit) this.roundTimeout(run.phase);
      }
    }
  }

  // ------------------------------------------------------------ fim das partidas

  private roundTimeout(phase: Phase): void {
    const s = this.session;
    if (!s) return;
    s.skip();
    this.sfx.wrong();
    this.ui.flashError('Tempo esgotado!');
    this.ui.bumpErrors();
    this.world.select(null);
    if (outOfLives(phase, s.errors)) {
      this.ui.setHud(this.hudFor(s));
      this.failPhase();
      return;
    }
    this.presentRound();
  }

  private finishRun(): void {
    const s = this.session;
    const run = this.run;
    if (!s) return;
    this.phase = 'end';
    this.world.enabled = false;
    this.world.select(null);
    this.ui.setRoundBar(null);
    const time = s.elapsedMs();
    this.ui.setTimer(time);

    if (run.kind === 'classic') {
      let record = false;
      if (run.mode === 'desafio') {
        const prev = this.progress.desafioBestMs;
        record = prev === null || time < prev;
        if (record) {
          this.progress.desafioBestMs = time;
          saveProgress(this.progress);
        }
      }
      this.later(650, () => {
        this.sfx.fanfare();
        if (record) this.world.celebrate();
        const best = this.progress.desafioBestMs;
        this.ui.setEndStats({ mode: run.mode, timeMs: time, errors: s.errors, rounds: s.totalRounds, best: best === null ? null : formatTime(best), record: record && run.mode === 'desafio' });
        this.ui.showScreen('end');
      });
      return;
    }

    if (run.kind === 'fase') {
      const stars = starsFor(run.phase, s.errors, time);
      const { betterStars } = recordPhase(this.progress, run.index, stars, time);
      saveProgress(this.progress);
      this.world.celebrate();
      this.sfx.fanfare();
      this.later(800, () =>
        this.ui.showPhaseEnd({
          phase: run.phase,
          won: true,
          stars,
          timeMs: time,
          errors: s.errors,
          hasNext: run.index + 1 < PHASES.length,
          improved: betterStars,
          onStar: (i) => this.sfx.star(i),
        }),
      );
    }
  }

  private failPhase(): void {
    const s = this.session;
    const run = this.run;
    if (!s || run.kind !== 'fase') return;
    s.end();
    this.phase = 'end';
    this.world.enabled = false;
    this.world.select(null);
    this.ui.setRoundBar(null);
    this.later(700, () => {
      this.sfx.fail();
      this.ui.showPhaseEnd({
        phase: run.phase,
        won: false,
        stars: 0,
        timeMs: s.elapsedMs(),
        errors: s.errors,
        hasNext: false,
        improved: false,
        onStar: () => undefined,
      });
    });
  }

  private endRelampago(): void {
    const s = this.session;
    if (!s) return;
    s.end();
    this.phase = 'end';
    this.world.enabled = false;
    this.world.select(null);
    this.ui.setTimer(0, true);
    this.sfx.setTempo(TEMPO_NORMAL);
    const prev = this.progress.relampagoBest;
    const record = this.score > prev;
    if (record) {
      this.progress.relampagoBest = this.score;
      saveProgress(this.progress);
      this.world.celebrate();
    }
    this.ui.showCountdown('Fim!');
    this.later(900, () => {
      this.ui.showCountdown(null);
      this.sfx.fanfare();
      this.ui.showFlashEnd({ score: this.score, best: prev, record, correct: s.correct, bestStreak: s.bestStreak, errors: s.errors });
    });
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

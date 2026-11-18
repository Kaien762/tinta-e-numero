import type { Volumes } from './audio';
import { MAX_STARS, PHASES, type Phase } from './game/levels';
import { PALETTE, backgroundHex, type SymbolId } from './game/palette';
import { isUnlocked, totalStars, type Progress } from './game/progress';
import { COLORS, WORDS, type ColorId, type Stimulus } from './game/rules';
import type { Mode } from './game/session';
import { symbolPathD } from './scene/symbols';

function el<T extends Element = HTMLElement>(sel: string): T {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`Elemento ${sel} não encontrado`);
  return node;
}

export function symbolSvg(id: SymbolId, color: string, size = 16): string {
  return `<svg class="sym" width="${size}" height="${size}" viewBox="-1.15 -1.15 2.3 2.3" aria-hidden="true"><path d="${symbolPathD(id)}" fill="${color}"/></svg>`;
}

const STAR_D = symbolPathD('estrela');
function starSvg(on: boolean, size = 18, cls = ''): string {
  return `<svg class="star ${on ? 'on' : 'off'} ${cls}" width="${size}" height="${size}" viewBox="-1.15 -1.15 2.3 2.3" aria-hidden="true"><path d="${STAR_D}"/></svg>`;
}
export const starsRow = (n: number, size = 18) => [0, 1, 2].map((i) => starSvg(i < n, size)).join('');

/** Etiqueta colorida com símbolo, usada nas falas do tutorial. */
export function pill(color: ColorId, text: string): string {
  const c = PALETTE[color];
  return `<span class="pill" style="--c:${c.hex};--t:${c.tint};--d:${c.deep}">${symbolSvg(c.symbol, c.deep, 14)}${text}</span>`;
}

export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${d}`;
}

export const formatPoints = (n: number) => n.toLocaleString('pt-BR');
const secs = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;

export interface UiHandlers {
  start(): void;
  tutorial(): void;
  jornada(): void;
  relampago(): void;
  classico(): void;
  treino(): void;
  desafio(): void;
  menu(): void;
  pickPhase(index: number): void;
  playPhase(): void;
  nextPhase(): void;
  retryPhase(): void;
  phases(): void;
  flashAgain(): void;
  replay(): void;
  changeMode(): void;
  volumes(v: Partial<Volumes>): void;
}

type ScreenName = 'start' | 'menu' | 'mode' | 'phases' | 'phaseIntro' | 'phaseEnd' | 'flashEnd' | 'end';

const MODE_LABEL: Record<Mode, string> = {
  tutorial: 'Tutorial',
  treino: 'Treino',
  desafio: 'Desafio',
  fase: 'Fase',
  relampago: 'Relâmpago',
};

export interface HudState {
  mode: Mode;
  label?: string;
  round: number;
  total: number;
  errors: number;
  lives?: number | null;
  score?: number | null;
  combo?: number | null;
  timer: boolean;
}

export class UI {
  readonly panel = el('#panel');
  private readonly hud = el('#hud');
  private readonly hudMode = el('#hud-mode');
  private readonly hudRound = el('#hud-round');
  private readonly hudTimer = el('#hud-timer');
  private readonly hudErrors = el('#hud-errors');
  private readonly hudLives = el('#hud-lives');
  private readonly hudScore = el('#hud-score');
  private readonly hudCombo = el('#hud-combo');
  private readonly btnSound = el<HTMLButtonElement>('#btn-sound');
  private readonly soundPanel = el('#sound-panel');
  private readonly plate = el('#plate');
  private readonly word = el<SVGSVGElement>('#word');
  private readonly wordTexts = Array.from(document.querySelectorAll<SVGTextElement>('#word text'));
  private readonly roundbar = el('#roundbar');
  private readonly roundbarFill = el('#roundbar i');
  private readonly dots = el('#dots');
  private readonly coach = el('#coach');
  private readonly toast = el('#toast');
  private readonly countdown = el('#countdown');
  private readonly floaters = el('#floaters');
  private readonly screens: Record<ScreenName, HTMLElement> = {
    start: el('#screen-start'),
    menu: el('#screen-menu'),
    mode: el('#screen-mode'),
    phases: el('#screen-phases'),
    phaseIntro: el('#screen-phase-intro'),
    phaseEnd: el('#screen-phase-end'),
    flashEnd: el('#screen-flash-end'),
    end: el('#screen-end'),
  };
  private toastTimer = 0;
  private flickerTimer = 0;
  private starTimers: number[] = [];
  private handlers: UiHandlers | null = null;
  current: ScreenName | null = null;

  constructor() {
    for (const c of COLORS) {
      document.querySelectorAll<HTMLElement>(`[data-sym="${c}"]`).forEach((n) => {
        n.innerHTML = symbolSvg(PALETTE[c].symbol, n.dataset.fill ?? PALETTE[c].hex, Number(n.dataset.size ?? 18));
      });
    }
    el('#menu-logo').innerHTML = el('#screen-start .logo').innerHTML;
  }

  bind(h: UiHandlers): void {
    this.handlers = h;
    const on = (sel: string, fn: () => void) => el(sel).addEventListener('click', fn);
    on('#btn-start', () => h.start());
    on('#btn-rever', () => h.tutorial());
    on('#btn-jornada', () => h.jornada());
    on('#btn-relampago', () => h.relampago());
    on('#btn-classico', () => h.classico());
    on('#btn-treino', () => h.treino());
    on('#btn-desafio', () => h.desafio());
    on('#btn-mode-back', () => h.menu());
    on('#btn-phases-back', () => h.menu());
    on('#btn-pi-play', () => h.playPhase());
    on('#btn-pi-back', () => h.phases());
    on('#btn-pe-next', () => h.nextPhase());
    on('#btn-pe-retry', () => h.retryPhase());
    on('#btn-pe-map', () => h.phases());
    on('#btn-fe-again', () => h.flashAgain());
    on('#btn-fe-menu', () => h.menu());
    on('#btn-replay', () => h.replay());
    on('#btn-change', () => h.changeMode());
    on('#btn-end-menu', () => h.menu());
    on('#btn-home', () => h.menu());
    el('#phase-grid').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-phase]');
      if (btn && !btn.disabled) h.pickPhase(Number(btn.dataset.phase));
    });

    this.btnSound.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSoundPanel();
    });
    this.soundPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', () => this.toggleSoundPanel(false));
    for (const kind of ['music', 'sfx'] as const) {
      const input = el<HTMLInputElement>(`#vol-${kind}`);
      input.addEventListener('input', () => {
        const v = Number(input.value) / 100;
        this.paintVolume(kind, v);
        h.volumes({ [kind]: v });
      });
    }
  }

  setVolumes(v: Volumes): void {
    for (const kind of ['music', 'sfx'] as const) {
      el<HTMLInputElement>(`#vol-${kind}`).value = String(Math.round(v[kind] * 100));
      this.paintVolume(kind, v[kind]);
    }
  }

  private paintVolume(kind: 'music' | 'sfx', v: number): void {
    el(`#vol-${kind}-out`).textContent = v === 0 ? 'mudo' : `${Math.round(v * 100)}%`;
    el(`#vol-${kind}`).style.setProperty('--fill', `${v * 100}%`);
    const music = Number(el<HTMLInputElement>('#vol-music').value);
    const sfx = Number(el<HTMLInputElement>('#vol-sfx').value);
    this.btnSound.classList.toggle('is-muted', music === 0 && sfx === 0);
  }

  private toggleSoundPanel(force?: boolean): void {
    const open = force ?? this.soundPanel.hidden;
    this.soundPanel.hidden = !open;
    this.btnSound.setAttribute('aria-expanded', String(open));
  }

  // ------------------------------------------------------------ telas

  showScreen(name: ScreenName | null): void {
    this.current = name;
    for (const [k, node] of Object.entries(this.screens)) node.hidden = k !== name;
    if (name !== 'phaseEnd') this.clearStarTimers();
    const btn = name ? this.screens[name].querySelector<HTMLButtonElement>('.btn-primary:not([hidden]), .menu-card, .mode-card, .phase-btn:not(:disabled)') : null;
    btn?.focus({ preventScroll: true });
  }

  showGame(on: boolean): void {
    this.hud.classList.toggle('is-off', !on);
    this.panel.classList.toggle('is-off', !on);
  }

  showMenu(p: Progress, desafioBest: string | null, afterTutorial: boolean): void {
    el('#menu-eyebrow').hidden = !afterTutorial;
    el('#menu-jornada').innerHTML = `${starSvg(true, 15)} ${totalStars(p)}/${MAX_STARS}`;
    el('#menu-relampago').textContent = `Recorde ${formatPoints(p.relampagoBest)}`;
    el('#menu-classico').textContent = desafioBest ? `Melhor ${desafioBest}` : 'Sem pressa';
    this.showScreen('menu');
  }

  showPhases(p: Progress): void {
    el('#phases-stars').innerHTML = `${starSvg(true, 20)} ${totalStars(p)} de ${MAX_STARS} estrelas`;
    el('#phase-grid').innerHTML = PHASES.map((ph, i) => {
      const open = isUnlocked(p, i);
      const stars = p.stars[i] ?? 0;
      const fresh = open && stars === 0;
      return `<button class="phase-btn${fresh ? ' is-next' : ''}${stars === 3 ? ' is-perfect' : ''}" type="button" data-phase="${i}" ${open ? '' : 'disabled'} aria-label="Fase ${ph.id}: ${ph.name}${open ? `, ${stars} estrelas` : ', bloqueada'}">
        <span class="phase-num">${open ? ph.id : '🔒'}</span>
        <span class="phase-stars">${starsRow(stars, 13)}</span>
      </button>`;
    }).join('');
    this.showScreen('phases');
  }

  showPhaseIntro(phase: Phase, bestStars: number): void {
    el('#pi-num').textContent = `Fase ${phase.id} de ${PHASES.length}`;
    el('#pi-name').textContent = phase.name;
    el('#pi-twist').textContent = phase.twist;
    const chips = [`🎯 ${phase.rounds} rodadas`];
    if (phase.roundTimeMs) chips.push(`⏱️ ${secs(phase.roundTimeMs)} por rodada`);
    chips.push(phase.lives ? `❤️ ${phase.lives} ${phase.lives === 1 ? 'vida' : 'vidas'}` : '❤️ vidas à vontade');
    if (phase.flicker) chips.push('✨ fundo pisca');
    if (phase.neutral) chips.push('⬜ fundo neutro');
    el('#pi-rules').innerHTML = chips.map((c) => `<span class="rule-chip">${c}</span>`).join('');
    const goals = [
      [1, 'Concluir a fase'],
      [2, 'No máximo 1 erro'],
      [3, `Sem erros em até ${secs(phase.parMs)}`],
    ] as const;
    el('#pi-goals').innerHTML = goals
      .map(([n, t]) => `<li class="${bestStars >= n ? 'done' : ''}"><span class="goal-stars">${starsRow(n, 14)}</span>${t}</li>`)
      .join('');
    this.showScreen('phaseIntro');
  }

  /** Resultado da fase; as estrelas entram uma a uma (onStar toca o som de cada). */
  showPhaseEnd(o: {
    phase: Phase;
    won: boolean;
    stars: number;
    timeMs: number;
    errors: number;
    hasNext: boolean;
    improved: boolean;
    onStar: (i: number) => void;
  }): void {
    el('#pe-num').textContent = `Fase ${o.phase.id} · ${o.phase.name}`;
    el('#pe-title').textContent = o.won
      ? o.phase.id === PHASES.length
        ? 'Jornada completa! 🏆'
        : 'Fase concluída!'
      : 'Não foi dessa vez';
    el('#pe-time').textContent = formatTime(o.timeMs);
    el('#pe-errors').textContent = String(o.errors);
    const starsBox = el('#pe-stars');
    starsBox.innerHTML = [0, 1, 2].map(() => starSvg(false, 54, 'big')).join('');
    starsBox.classList.toggle('is-lost', !o.won);
    el('#pe-msg').textContent = !o.won
      ? 'As vidas acabaram. Respire, leia a palavra e siga a cor das letras.'
      : o.stars === 3
        ? 'Perfeito! Três estrelas.'
        : o.stars === 2
          ? 'Muito bem! Para 3 estrelas: sem erros e dentro do tempo.'
          : 'Passou! Tente com menos erros para ganhar mais estrelas.';
    if (o.won && o.improved) el('#pe-msg').textContent += ' Novo melhor resultado!';
    const next = el<HTMLButtonElement>('#btn-pe-next');
    next.hidden = !(o.won && o.hasNext);
    el('#btn-pe-retry').classList.toggle('btn-primary', next.hidden);
    el('#btn-pe-retry').classList.toggle('btn-ghost', !next.hidden);
    this.showScreen('phaseEnd');
    this.clearStarTimers();
    if (o.won) {
      const svgs = Array.from(starsBox.querySelectorAll('svg'));
      for (let i = 0; i < o.stars; i++) {
        this.starTimers.push(
          window.setTimeout(() => {
            svgs[i]?.classList.replace('off', 'on');
            svgs[i]?.classList.add('pop');
            o.onStar(i);
          }, 380 + i * 330),
        );
      }
    }
  }

  showFlashEnd(o: { score: number; best: number; record: boolean; correct: number; bestStreak: number; errors: number }): void {
    el('#fe-score').textContent = formatPoints(o.score);
    el('#fe-record').hidden = !o.record;
    el('#fe-best').textContent = o.record ? `Recorde anterior: ${formatPoints(o.best)}` : `Recorde: ${formatPoints(o.best)}`;
    el('#fe-correct').textContent = String(o.correct);
    el('#fe-combo').textContent = String(o.bestStreak);
    el('#fe-errors').textContent = String(o.errors);
    this.showScreen('flashEnd');
    this.restartAnim(el('#fe-score'), 'pop-big');
  }

  setEndStats(o: { mode: Mode; timeMs: number; errors: number; rounds: number; best: string | null; record: boolean }): void {
    el('#end-mode').textContent = MODE_LABEL[o.mode];
    el('#stat-time').hidden = o.mode !== 'desafio';
    el('#end-time').textContent = formatTime(o.timeMs);
    el('#end-errors').textContent = String(o.errors);
    el('#end-rounds').textContent = `${o.rounds}/${o.rounds}`;
    const best = el('#end-best');
    best.hidden = o.mode !== 'desafio' || !o.best;
    best.textContent = o.record ? '🏆 Novo melhor tempo!' : `Melhor tempo: ${o.best ?? ''}`;
    el('#end-msg').textContent =
      o.errors === 0
        ? 'Nenhuma tentativa errada. Olho afiado!'
        : o.errors <= 2
          ? 'Quase perfeito. O fundo tentou te enganar algumas vezes.'
          : 'Cada rodada treina a atenção. Que tal mais uma?';
  }

  // ------------------------------------------------------------ HUD e painel

  setHud(o: HudState): void {
    this.hudMode.textContent = o.label ?? MODE_LABEL[o.mode];
    this.hudMode.dataset.mode = o.mode;
    const finite = Number.isFinite(o.total);
    this.hudRound.hidden = !finite;
    this.hudRound.textContent = o.mode === 'tutorial' ? `${o.round} de ${o.total}` : `Rodada ${o.round}/${o.total}`;
    const usesLives = o.lives !== undefined && o.lives !== null;
    this.hudErrors.hidden = o.mode === 'tutorial' || usesLives || o.mode === 'relampago';
    this.hudErrors.textContent = `Erros: ${o.errors}`;
    this.hudLives.hidden = !usesLives;
    if (usesLives) {
      const left = Math.max(0, (o.lives ?? 0) - o.errors);
      this.hudLives.innerHTML = Array.from({ length: o.lives ?? 0 }, (_, i) => `<span class="heart ${i < left ? 'on' : 'off'}">♥</span>`).join('');
      this.hudLives.setAttribute('aria-label', `${left} de ${o.lives} vidas`);
    }
    this.hudScore.hidden = o.score === undefined || o.score === null;
    if (!this.hudScore.hidden) this.hudScore.textContent = formatPoints(o.score ?? 0);
    this.hudCombo.hidden = o.combo === undefined || o.combo === null;
    if (!this.hudCombo.hidden) {
      this.hudCombo.textContent = `x${o.combo}`;
      this.hudCombo.dataset.level = String(o.combo);
    }
    this.hudTimer.hidden = !o.timer;
    this.setDots(finite ? o.round - 1 : 0, finite ? o.total : 0);
  }

  private setDots(done: number, total: number): void {
    this.dots.hidden = total === 0 || total > 14;
    if (this.dots.hidden) return;
    if (this.dots.childElementCount !== total) this.dots.innerHTML = '<i></i>'.repeat(total);
    Array.from(this.dots.children).forEach((d, i) => {
      d.className = i < done ? 'done' : i === done ? 'now' : '';
    });
  }

  bumpErrors(): void {
    this.restartAnim(this.hudErrors.hidden ? this.hudLives : this.hudErrors, 'bump');
  }

  bumpCombo(): void {
    this.restartAnim(this.hudCombo, 'bump');
  }

  bumpScore(): void {
    this.restartAnim(this.hudScore, 'bump');
  }

  setTimer(ms: number, warn = false): void {
    this.hudTimer.textContent = formatTime(ms);
    this.hudTimer.classList.toggle('is-warn', warn);
  }

  /** Fração restante do tempo da rodada (1 → 0); null esconde a barra. */
  setRoundBar(frac: number | null): void {
    this.roundbar.hidden = frac === null;
    if (frac === null) return;
    const f = Math.max(0, Math.min(1, frac));
    this.roundbarFill.style.transform = `scaleX(${f})`;
    this.roundbar.classList.toggle('is-low', f < 0.3);
  }

  setStimulus(s: Stimulus | null, flicker = false): void {
    window.clearInterval(this.flickerTimer);
    this.flickerTimer = 0;
    const text = s ? WORDS[s.value] : '';
    for (const t of this.wordTexts) t.textContent = text;
    this.word.setAttribute('aria-label', s ? `${text}` : '');
    this.word.style.setProperty('--ink', s ? PALETTE[s.ink].hex : 'transparent');
    this.paintBackground(s ? s.background : 'neutro');
    this.plate.dataset.ink = s ? s.ink : '';
    this.plate.dataset.value = s ? String(s.value) : '';
    if (s) this.restartAnim(this.plate, 'pop');
    if (s && flicker) {
      // o fundo troca entre as cores que não são a das letras
      const others = COLORS.filter((c) => c !== s.ink);
      let i = Math.max(0, others.indexOf(s.background as ColorId));
      this.flickerTimer = window.setInterval(() => {
        i = (i + 1) % others.length;
        this.paintBackground(others[i]);
      }, 650);
    }
  }

  private paintBackground(bg: Stimulus['background']): void {
    this.plate.style.setProperty('--bg', backgroundHex(bg));
    this.plate.dataset.bg = bg;
  }

  setCoach(html: string, tutorial: boolean): void {
    this.coach.innerHTML = html;
    this.coach.classList.toggle('is-tutorial', tutorial);
  }

  flashError(text = 'Ops! Tente de novo.'): void {
    this.restartAnim(this.panel, 'shake');
    this.showToast(text, 'bad');
  }

  showToast(text: string, kind: 'good' | 'bad', ms = 900): void {
    this.toast.textContent = text;
    this.toast.dataset.kind = kind;
    this.restartAnim(this.toast, 'show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  /** Texto que sobe e some num ponto da tela (pontos, "+combo"). */
  floatText(x: number, y: number, html: string, kind: 'points' | 'combo' | 'bad' = 'points'): void {
    const n = document.createElement('div');
    n.className = `floater ${kind}`;
    n.innerHTML = html;
    n.style.left = `${x}px`;
    n.style.top = `${y}px`;
    this.floaters.appendChild(n);
    window.setTimeout(() => n.remove(), 1000);
  }

  showCountdown(label: string | null): void {
    this.countdown.textContent = label ?? '';
    if (label) this.restartAnim(this.countdown, 'show');
    else this.countdown.classList.remove('show');
  }

  private clearStarTimers(): void {
    for (const t of this.starTimers) window.clearTimeout(t);
    this.starTimers = [];
  }

  private restartAnim(node: Element, cls: string): void {
    node.classList.remove(cls);
    void (node as HTMLElement).offsetWidth;
    node.classList.add(cls);
  }

  get bound(): boolean {
    return this.handlers !== null;
  }
}

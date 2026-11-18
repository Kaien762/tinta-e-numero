import { PALETTE, backgroundHex, type SymbolId } from './game/palette';
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

export interface UiHandlers {
  start(): void;
  treino(): void;
  desafio(): void;
  replay(): void;
  changeMode(): void;
  tutorial(): void;
  sound(on: boolean): void;
}

type ScreenName = 'start' | 'mode' | 'end';

const MODE_LABEL: Record<Mode, string> = { tutorial: 'Tutorial', treino: 'Treino', desafio: 'Desafio' };

export class UI {
  readonly panel = el('#panel');
  private readonly hud = el('#hud');
  private readonly hudMode = el('#hud-mode');
  private readonly hudRound = el('#hud-round');
  private readonly hudTimer = el('#hud-timer');
  private readonly hudErrors = el('#hud-errors');
  private readonly btnSound = el<HTMLButtonElement>('#btn-sound');
  private readonly plate = el('#plate');
  private readonly word = el<SVGSVGElement>('#word');
  private readonly wordTexts = Array.from(document.querySelectorAll<SVGTextElement>('#word text'));
  private readonly coach = el('#coach');
  private readonly toast = el('#toast');
  private readonly countdown = el('#countdown');
  private readonly screens: Record<ScreenName, HTMLElement> = {
    start: el('#screen-start'),
    mode: el('#screen-mode'),
    end: el('#screen-end'),
  };
  private toastTimer = 0;

  constructor() {
    for (const c of COLORS) {
      document.querySelectorAll<HTMLElement>(`[data-sym="${c}"]`).forEach((n) => {
        n.innerHTML = symbolSvg(PALETTE[c].symbol, n.dataset.fill ?? PALETTE[c].hex, Number(n.dataset.size ?? 18));
      });
    }
  }

  bind(h: UiHandlers): void {
    el('#btn-start').addEventListener('click', () => h.start());
    el('#btn-treino').addEventListener('click', () => h.treino());
    el('#btn-desafio').addEventListener('click', () => h.desafio());
    el('#btn-rever').addEventListener('click', () => h.tutorial());
    el('#btn-replay').addEventListener('click', () => h.replay());
    el('#btn-change').addEventListener('click', () => h.changeMode());
    this.btnSound.addEventListener('click', () => {
      const on = this.btnSound.getAttribute('aria-pressed') !== 'true';
      this.setSound(on);
      h.sound(on);
    });
  }

  setSound(on: boolean): void {
    this.btnSound.setAttribute('aria-pressed', String(on));
    this.btnSound.setAttribute('aria-label', on ? 'Desligar som' : 'Ligar som');
  }

  showScreen(name: ScreenName | null, opts: { afterTutorial?: boolean } = {}): void {
    for (const [k, node] of Object.entries(this.screens)) node.hidden = k !== name;
    if (name === 'mode') el('#mode-eyebrow').hidden = !opts.afterTutorial;
    const btn = name ? this.screens[name].querySelector<HTMLButtonElement>('.btn-primary, .mode-card') : null;
    btn?.focus({ preventScroll: true });
  }

  showGame(on: boolean): void {
    this.hud.classList.toggle('is-off', !on);
    this.panel.classList.toggle('is-off', !on);
  }

  setHud(o: { mode: Mode; round: number; total: number; errors: number }): void {
    this.hudMode.textContent = MODE_LABEL[o.mode];
    this.hudMode.dataset.mode = o.mode;
    this.hudRound.textContent = o.mode === 'tutorial' ? `${o.round} de ${o.total}` : `Rodada ${o.round}/${o.total}`;
    this.hudErrors.hidden = o.mode === 'tutorial';
    this.hudErrors.textContent = `Erros: ${o.errors}`;
    this.hudTimer.hidden = o.mode !== 'desafio';
  }

  bumpErrors(): void {
    this.restartAnim(this.hudErrors, 'bump');
  }

  setTimer(ms: number): void {
    this.hudTimer.textContent = formatTime(ms);
  }

  setStimulus(s: Stimulus | null): void {
    const text = s ? WORDS[s.value] : '';
    for (const t of this.wordTexts) t.textContent = text;
    this.word.setAttribute('aria-label', s ? `${text}` : '');
    this.word.style.setProperty('--ink', s ? PALETTE[s.ink].hex : 'transparent');
    this.plate.style.setProperty('--bg', backgroundHex(s ? s.background : 'neutro'));
    this.plate.dataset.bg = s ? s.background : '';
    this.plate.dataset.ink = s ? s.ink : '';
    this.plate.dataset.value = s ? String(s.value) : '';
    if (s) this.restartAnim(this.plate, 'pop');
  }

  setCoach(html: string, tutorial: boolean): void {
    this.coach.innerHTML = html;
    this.coach.classList.toggle('is-tutorial', tutorial);
  }

  flashError(): void {
    this.restartAnim(this.panel, 'shake');
    this.showToast('Ops! Tente de novo.', 'bad');
  }

  pulseSuccess(): void {
    this.restartAnim(this.plate, 'pop');
  }

  showToast(text: string, kind: 'good' | 'bad', ms = 900): void {
    this.toast.textContent = text;
    this.toast.dataset.kind = kind;
    this.restartAnim(this.toast, 'show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  showCountdown(label: string | null): void {
    this.countdown.textContent = label ?? '';
    if (label) this.restartAnim(this.countdown, 'show');
    else this.countdown.classList.remove('show');
  }

  setEndStats(o: { mode: Mode; timeMs: number; errors: number; rounds: number }): void {
    el('#end-mode').textContent = MODE_LABEL[o.mode];
    el('#stat-time').hidden = o.mode !== 'desafio';
    el('#end-time').textContent = formatTime(o.timeMs);
    el('#end-errors').textContent = String(o.errors);
    el('#end-rounds').textContent = `${o.rounds}/${o.rounds}`;
    el('#end-msg').textContent =
      o.errors === 0
        ? 'Nenhuma tentativa errada. Olho afiado!'
        : o.errors <= 2
          ? 'Quase perfeito. O fundo tentou te enganar algumas vezes.'
          : 'Cada rodada treina a atenção. Que tal mais uma?';
  }

  private restartAnim(node: Element, cls: string): void {
    node.classList.remove(cls);
    void (node as HTMLElement).offsetWidth;
    node.classList.add(cls);
  }
}

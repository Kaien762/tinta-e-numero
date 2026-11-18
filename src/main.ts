import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { Sfx } from './audio';
import { Game } from './game';
import { COLORS, type ColorId, type Stimulus, type Value } from './game/rules';
import { World } from './scene/world';
import { UI } from './ui';

async function boot(): Promise<void> {
  // As casas desenham os algarismos em canvas: a fonte precisa estar carregada antes.
  await Promise.all([
    document.fonts.load('700 120px Fredoka', 'UM DOIS TRÊS QUATRO 1234'),
    document.fonts.load('600 18px Fredoka'),
    document.fonts.load('500 16px Fredoka'),
  ]).catch(() => undefined);

  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  if (!canvas) throw new Error('canvas #scene não encontrado');

  const ui = new UI();
  const sfx = new Sfx();
  let game: Game | null = null;
  const world = new World(canvas, sfx, {
    resolve: (piece, cell) => game?.resolve(piece, cell) ?? { kind: 'noop' },
    landed: (result) => game?.landed(result),
    onHold: (piece) => game?.onHold(piece),
  });
  game = new Game(ui, world, sfx);

  // A mesa ocupa o espaço entre o painel e a borda de baixo.
  const layout = () => {
    const W = window.innerWidth, H = window.innerHeight;
    const panel = ui.panel.getBoundingClientRect();
    const side = W < 600 ? 6 : 24;
    const top = panel.bottom + 10;
    const bottom = H - 12 - safeBottom();
    world.fit({ x: side, y: top, w: W - side * 2, h: Math.max(120, bottom - top) });
  };
  layout();
  window.addEventListener('resize', layout);
  new ResizeObserver(layout).observe(ui.panel);

  // Áudio só pode ligar num gesto do usuário.
  window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });

  const loop = (now: number) => {
    world.frame(now);
    game?.frame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.body.classList.add('ready');

  if (new URLSearchParams(location.search).has('debug')) {
    const g = game;
    Object.assign(window, {
      __tinta: {
        game: g,
        world,
        state: () => ({
          phase: g.phase,
          mode: g.session?.mode ?? null,
          round: g.session?.round ?? null,
          errors: g.session?.errors ?? null,
          finished: g.session?.finished ?? null,
          elapsedMs: g.session?.elapsedMs() ?? null,
          stimulus: g.session?.stimulus ?? null,
          positions: g.session?.positions ?? null,
        }),
        pieceScreen: (c: ColorId) => world.pieceScreen(c),
        cellScreen: (col: ColorId, row: Value) => world.cellScreen({ col, row }),
        setStimulus: (s: Stimulus) => {
          g.session?.setStimulus(s);
          ui.setStimulus(s);
        },
        colors: COLORS,
      },
    });
  }
}

function safeBottom(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom');
  return parseFloat(v) || 0;
}

boot().catch((err: unknown) => {
  console.error(err);
  const box = document.querySelector('#fatal');
  if (box) {
    box.removeAttribute('hidden');
    box.textContent = 'Não foi possível iniciar o jogo neste navegador (WebGL indisponível?).';
  }
});

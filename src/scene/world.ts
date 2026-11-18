import {
  Mesh,
  MeshStandardMaterial,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Vector2,
  Vector3,
} from 'three';
import type { Sfx } from '../audio';
import { Input } from '../input';
import { PALETTE } from '../game/palette';
import { COLORS, HOME, VALUES, atCell, isAt, type Cell, type ColorId } from '../game/rules';
import type { AttemptResult } from '../game/session';
import { BoardView, FRAME_MAX, FRAME_MIN, TABLE_Y, TILE_TOP, footFor, footForCell } from './board';
import { Fx } from './fx';
import { buildPieces, type PieceView } from './pieces';
import { Stage, type Rect } from './stage';
import { blobTexture, woodTexture } from './textures';
import { Tweens, ease } from './tween';

export interface WorldHooks {
  /** Decide a jogada (regra do jogo). Chamado assim que a peça é solta. */
  resolve(piece: ColorId, cell: Cell): AttemptResult;
  /** A peça encostou na casa: hora do retorno visual e sonoro. */
  landed(result: AttemptResult, piece: ColorId, cell: Cell): void;
  /** Peça na mão (selecionada ou sendo arrastada), ou nenhuma. */
  onHold(piece: ColorId | null): void;
}

export type Via = 'drag' | 'tap';

/** Tudo o que é 3D: mesa, tabuleiro, peças, animações e seleção. */
export class World {
  readonly stage: Stage;
  readonly board: BoardView;
  readonly pieces: Record<ColorId, PieceView>;
  readonly fx = new Fx();
  readonly tweens = new Tweens();
  readonly input: Input;
  enabled = false;
  selected: ColorId | null = null;
  dragCell: Cell | null = null;

  private readonly hooks: WorldHooks;
  private readonly sfx: Sfx;
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hitPieces: Mesh[];
  private readonly visualPieces: Mesh[];
  private hintPiece: ColorId | null = null;
  private last = 0;
  private readonly tmp = new Vector3();

  constructor(canvas: HTMLCanvasElement, sfx: Sfx, hooks: WorldHooks) {
    this.hooks = hooks;
    this.sfx = sfx;
    this.stage = new Stage(canvas);
    const aniso = Math.min(8, this.stage.renderer.capabilities.getMaxAnisotropy());

    const wood = woodTexture();
    wood.wrapS = wood.wrapT = RepeatWrapping;
    wood.repeat.set(120 / 5.6, 120 / 11.2);
    wood.anisotropy = aniso;
    const table = new Mesh(
      new PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ map: wood, roughness: 0.6 }),
    );
    table.position.y = TABLE_Y;
    table.receiveShadow = true;
    this.stage.scene.add(table);

    this.board = new BoardView(aniso);
    this.stage.scene.add(this.board.group, this.fx.group);

    this.pieces = buildPieces(blobTexture());
    for (const c of COLORS) {
      const p = this.pieces[c];
      footFor(c, HOME, p.foot);
      this.stage.scene.add(p.group, p.ghost, p.blob, p.halo);
    }
    this.hitPieces = COLORS.map((c) => this.pieces[c].hit);
    this.visualPieces = COLORS.flatMap((c) => this.pieces[c].visuals);
    this.stage.bounds.set(FRAME_MIN, FRAME_MAX);
    this.input = new Input(canvas, this);
  }

  fit(free: Rect): void {
    this.stage.fit(free);
  }

  // ------------------------------------------------------------ consulta (Input)

  private ray(ndc: Vector2): Raycaster {
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    return this.raycaster;
  }

  /**
   * Peça sob o ponteiro. Acertar o desenho da peça sempre vale. A área de toque ampliada
   * (cilindro invisível) só vale fora das casas ou na casa da própria peça: assim ela não
   * "rouba" o toque numa casa que fica logo atrás de outra peça.
   */
  pickPiece(ndc: Vector2): ColorId | null {
    const ray = this.ray(ndc);
    const exact = ray.intersectObjects(this.visualPieces, false)[0];
    if (exact) return exact.object.userData.color as ColorId;
    const loose = ray.intersectObjects(this.hitPieces, false)[0];
    if (!loose) return null;
    const color = loose.object.userData.color as ColorId;
    const cell = this.pickCell(ndc);
    return !cell || isAt(this.pieces[color].rest, cell) ? color : null;
  }

  /** Peça que está parada numa casa (pela posição lógica). */
  occupant(cell: Cell): ColorId | null {
    return COLORS.find((c) => isAt(this.pieces[c].rest, cell)) ?? null;
  }

  pickCell(ndc: Vector2): Cell | null {
    const hit = this.ray(ndc).intersectObjects(this.board.hitTargets, false)[0];
    return hit ? (hit.object.userData.cell as Cell) : null;
  }

  planePoint(ndc: Vector2, y: number): Vector3 | null {
    this.plane.constant = -y;
    return this.ray(ndc).ray.intersectPlane(this.plane, new Vector3());
  }

  // ------------------------------------------------------------ ações (Input)

  select(color: ColorId | null): void {
    if (this.selected === color) return;
    if (this.selected) {
      const prev = this.pieces[this.selected];
      prev.selected = false;
      prev.liftTarget = 0;
    }
    this.selected = color;
    this.hover(null);
    if (color) {
      const p = this.pieces[color];
      p.selected = true;
      p.liftTarget = 0.2;
      this.sfx.pick();
    }
    this.hooks.onHold(color);
  }

  hover(cell: Cell | null): void {
    const sel = this.selected;
    if (!sel || !cell || isAt(this.pieces[sel].rest, cell)) {
      this.board.setIndicator(null);
      this.showGhost(null, null);
      return;
    }
    this.board.setIndicator(cell, PALETTE[sel].hex);
    this.showGhost(sel, cell);
  }

  beginDrag(color: ColorId): void {
    const p = this.pieces[color];
    this.select(null);
    this.settleInterrupted(p);
    p.dragging = true;
    p.liftTarget = 0.55;
    this.dragCell = null;
    this.sfx.pick();
    this.hooks.onHold(color);
  }

  dragTo(color: ColorId, x: number, z: number): void {
    const p = this.pieces[color];
    p.foot.set(x, TILE_TOP, z);
    const cell = this.board.cellFromPoint(x, z);
    this.dragCell = cell;
    if (cell && !isAt(p.rest, cell)) {
      this.board.setIndicator(cell, PALETTE[color].hex);
      this.showGhost(color, cell);
    } else {
      this.board.setIndicator(null);
      this.showGhost(null, null);
    }
  }

  endDrag(color: ColorId, cell: Cell | null): void {
    const p = this.pieces[color];
    p.dragging = false;
    this.dragCell = null;
    this.board.setIndicator(null);
    this.showGhost(null, null);
    if (cell) this.attemptMove(color, cell, 'drag');
    else this.toRest(p);
    this.hooks.onHold(null);
  }

  tapMove(color: ColorId, cell: Cell): void {
    this.attemptMove(color, cell, 'tap');
  }

  // ------------------------------------------------------------ jogo (Game)

  resetPieces(animated: boolean): void {
    this.select(null);
    COLORS.forEach((c, i) => {
      const p = this.pieces[c];
      p.rest = HOME;
      p.dragging = false;
      const home = footFor(c, HOME, new Vector3());
      this.tweens.cancel(p);
      if (!animated || p.foot.distanceTo(home) < 0.01) {
        p.foot.copy(home);
        p.arc = p.lift = p.liftTarget = p.shakeX = 0;
        return;
      }
      this.tweens.add({ key: p, delay: i * 45, duration: 1, done: () => this.hop(p, home, 260) });
    });
  }

  /** Chuva de confete de cerâmica sobre o tabuleiro (vitória, recorde). */
  celebrate(): void {
    for (let k = 0; k < 10; k++) {
      const color = COLORS[k % COLORS.length];
      this.tweens.add({
        duration: 1,
        delay: k * 90,
        done: () => {
          const cell: Cell = { col: COLORS[Math.floor(Math.random() * 4)], row: VALUES[Math.floor(Math.random() * 4)] };
          this.fx.burst(color, footForCell(cell, new Vector3()), 12, 1.35);
        },
      });
    }
  }

  /** Seta sobre uma peça e/ou contorno numa casa (tutorial). */
  setHint(piece: ColorId | null, cell: Cell | null): void {
    this.hintPiece = piece;
    this.board.setHint(cell);
  }

  /** Centro visual de uma peça e de uma casa, em px da janela (testes e depuração). */
  pieceScreen(color: ColorId): { x: number; y: number } {
    const p = this.pieces[color].group.position;
    return this.stage.project(this.tmp.set(p.x, p.y + 0.4, p.z));
  }

  cellScreen(cell: Cell): { x: number; y: number } {
    return this.stage.project(footForCell(cell, this.tmp));
  }

  frame(now: number): void {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const t = now / 1000;
    this.tweens.update(now);
    for (const c of COLORS) {
      const p = this.pieces[c];
      p.update(dt, t, this.board.surfaceY(p.foot.x, p.foot.z));
    }
    this.board.update(dt, t);
    this.fx.update(dt, t, this.hintPiece ? this.pieces[this.hintPiece].group.position : null);
    this.stage.render();
  }

  // ------------------------------------------------------------ animação

  private attemptMove(color: ColorId, cell: Cell, via: Via): void {
    const p = this.pieces[color];
    const result = this.hooks.resolve(color, cell);
    if (result.kind === 'noop') {
      this.toRest(p);
      return;
    }
    const target = footForCell(cell, new Vector3());
    const land = (after: () => void) => (via === 'drag' ? this.settle(p, target, after) : this.hop(p, target, 0, after));

    if (result.kind === 'correct') {
      p.rest = atCell(cell);
      land(() => {
        this.sfx.place();
        this.board.flashSuccess(cell, PALETTE[color].hex);
        this.fx.burst(color, target);
        this.hooks.landed(result, color, cell);
      });
      return;
    }
    land(() => {
      this.sfx.place();
      this.board.flashError(cell);
      this.hooks.landed(result, color, cell);
      this.shake(p, () => this.toRest(p));
    });
  }

  /** Junta deslocamentos de uma animação interrompida na posição base. */
  private settleInterrupted(p: PieceView): void {
    this.tweens.cancel(p);
    p.foot.x += p.shakeX;
    p.foot.y += p.arc;
    p.arc = 0;
    p.shakeX = 0;
  }

  private hop(p: PieceView, to: Vector3, ms: number, done?: () => void): void {
    this.settleInterrupted(p);
    const from = p.foot.clone();
    const lift0 = p.lift;
    p.liftTarget = 0;
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const duration = ms || Math.min(270, Math.max(170, 140 + d * 22));
    const h = Math.min(0.85, 0.22 + d * 0.12);
    this.tweens.add({
      key: p,
      duration,
      ease: ease.inOutSine,
      update: (e) => {
        p.foot.lerpVectors(from, to, e);
        p.arc = Math.sin(Math.PI * e) * h;
        p.lift = lift0 * (1 - e);
      },
      done: () => {
        p.arc = 0;
        p.foot.copy(to);
        done?.();
      },
    });
  }

  private settle(p: PieceView, to: Vector3, done: () => void): void {
    this.settleInterrupted(p);
    const from = p.foot.clone();
    const lift0 = p.lift;
    p.liftTarget = 0;
    this.tweens.add({
      key: p,
      duration: 120,
      ease: ease.outCubic,
      update: (e) => {
        p.foot.lerpVectors(from, to, e);
        p.lift = lift0 * (1 - e);
      },
      done: () => {
        p.foot.copy(to);
        p.lift = 0;
        done();
      },
    });
  }

  private shake(p: PieceView, done: () => void): void {
    this.tweens.add({
      key: p,
      duration: 230,
      ease: ease.linear,
      update: (e) => {
        p.shakeX = Math.sin(e * Math.PI * 6) * 0.075 * (1 - e);
      },
      done: () => {
        p.shakeX = 0;
        done();
      },
    });
  }

  private toRest(p: PieceView): void {
    this.hop(p, footFor(p.color, p.rest, new Vector3()), 0);
  }

  private showGhost(color: ColorId | null, cell: Cell | null): void {
    for (const c of COLORS) {
      const g = this.pieces[c].ghost;
      const on = c === color && !!cell;
      g.visible = on;
      if (on && cell) footForCell(cell, g.position);
    }
  }
}

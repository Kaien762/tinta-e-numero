import { Vector2 } from 'three';
import { sameCell, type Cell, type ColorId } from './game/rules';
import { TILE_TOP } from './scene/board';
import type { World } from './scene/world';

/** Distância (px) que transforma um toque em arrasto. */
const DRAG_PX = 7;
/**
 * O ponteiro é projetado no topo das casas: a casa sob o dedo/mouse é sempre o destino.
 * A peça flutua um pouco acima (fica visível acima do dedo) e o fantasma mostra onde cai.
 */
const PLANE_Y = TILE_TOP;

type State = 'idle' | 'piece' | 'drag' | 'cell' | 'empty';

/**
 * Mouse e toque com a mesma lógica:
 * - arrastar a peça e soltar na casa;
 * - ou tocar na peça (fica selecionada) e depois tocar na casa.
 */
export class Input {
  private state: State = 'idle';
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private piece: ColorId | null = null;
  private cell: Cell | null = null;
  private readonly ndc = new Vector2();
  private readonly canvas: HTMLCanvasElement;
  private readonly world: World;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.world = world;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.cancel(e));
    canvas.addEventListener('pointerleave', (e) => {
      if (this.pointerId === null && e.pointerType === 'mouse') this.world.hover(null);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private toNdc(e: PointerEvent): Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private down(e: PointerEvent): void {
    if (!this.world.enabled || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const ndc = this.toNdc(e);
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* navegador sem captura: segue sem */
    }
    this.startX = e.clientX;
    this.startY = e.clientY;

    const piece = this.world.pickPiece(ndc);
    if (piece) {
      this.state = 'piece';
      this.piece = piece;
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    const cell = this.world.pickCell(ndc);
    if (this.world.selected && cell) {
      this.state = 'cell';
      this.cell = cell;
      this.world.hover(cell);
    } else {
      this.state = 'empty';
    }
  }

  private move(e: PointerEvent): void {
    const ndc = this.toNdc(e);
    if (this.pointerId === null) {
      this.hoverAt(ndc, e);
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    if (this.state === 'piece' && this.piece) {
      if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < DRAG_PX) return;
      this.state = 'drag';
      this.world.beginDrag(this.piece);
    }
    if (this.state === 'drag' && this.piece) {
      const p = this.world.planePoint(ndc, PLANE_Y);
      if (p) this.world.dragTo(this.piece, p.x, p.z);
    } else if (this.state === 'cell') {
      this.world.hover(this.world.pickCell(ndc));
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const ndc = this.toNdc(e);
    const { state, piece, cell } = this;
    this.reset();
    if (!this.world.enabled) {
      if (state === 'drag' && piece) this.world.endDrag(piece, null);
      return;
    }
    switch (state) {
      case 'piece':
        if (piece) this.world.select(this.world.selected === piece ? null : piece);
        break;
      case 'drag':
        if (piece) this.world.endDrag(piece, this.world.dragCell);
        break;
      case 'cell': {
        const sel = this.world.selected;
        const released = this.world.pickCell(ndc);
        if (sel && released && sameCell(released, cell)) {
          this.world.select(null);
          this.world.tapMove(sel, released);
        } else {
          this.world.hover(null);
        }
        break;
      }
      case 'empty':
        this.world.select(null);
        break;
      case 'idle':
        break;
    }
    this.hoverAt(ndc, e);
  }

  private cancel(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const { state, piece } = this;
    this.reset();
    if (state === 'drag' && piece) this.world.endDrag(piece, null);
  }

  private reset(): void {
    const id = this.pointerId;
    this.pointerId = null;
    this.state = 'idle';
    this.piece = null;
    this.cell = null;
    if (id !== null) {
      try {
        this.canvas.releasePointerCapture(id);
      } catch {
        /* já liberado */
      }
    }
  }

  private hoverAt(ndc: Vector2, e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || !this.world.enabled) {
      this.canvas.style.cursor = '';
      return;
    }
    if (this.world.pickPiece(ndc)) {
      this.canvas.style.cursor = 'grab';
      this.world.hover(null);
      return;
    }
    const cell = this.world.selected ? this.world.pickCell(ndc) : null;
    this.world.hover(cell);
    this.canvas.style.cursor = cell ? 'pointer' : '';
  }
}

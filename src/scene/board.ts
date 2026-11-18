import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../game/palette';
import { COLORS, VALUES, sameCell, type Cell, type ColorId, type Position, type Value } from '../game/rules';
import { headerTexture, slotTexture, tileTexture } from './textures';

// Medidas do tabuleiro (unidades do mundo). Linhas 1→4 de trás para a frente.
export const PITCH = 1.14;
export const TILE = 1.0;
export const TILE_TOP = 0.13;
export const BOARD_TOP = 0;
export const TRAY_TOP = 0;
export const TABLE_Y = -0.34;

export const colIndex = (c: ColorId) => COLORS.indexOf(c);
export const colX = (c: ColorId) => (colIndex(c) - 1.5) * PITCH;
export const rowZ = (r: number) => (r - 2.5) * PITCH;
export const HEADER_Z = rowZ(1) - PITCH / 2 - 0.42;
export const TRAY_Z = rowZ(4) + PITCH / 2 + 1.05;

const HALF_W = 1.5 * PITCH + TILE / 2 + 0.3;
const BOARD_Z0 = HEADER_Z - 0.6;
const BOARD_Z1 = rowZ(4) + TILE / 2 + 0.3;
const TRAY_D = 1.2;

/** Caixa que a câmera precisa enquadrar. */
export const FRAME_MIN = new Vector3(-HALF_W, TABLE_Y, BOARD_Z0);
export const FRAME_MAX = new Vector3(HALF_W, 1.05, TRAY_Z + TRAY_D / 2);

export function footForCell(cell: Cell, out = new Vector3()): Vector3 {
  return out.set(colX(cell.col), TILE_TOP, rowZ(cell.row));
}

/** Ponto de apoio da base da peça para uma posição lógica. */
export function footFor(color: ColorId, pos: Position, out = new Vector3()): Vector3 {
  if (pos.kind === 'home') return out.set(colX(color), TRAY_TOP, TRAY_Z);
  return footForCell(pos, out);
}

function roundedRect(target: Shape | Path, w: number, h: number, r: number): void {
  const x = -w / 2, y = -h / 2;
  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.quadraticCurveTo(x + w, y, x + w, y + r);
  target.lineTo(x + w, y + h - r);
  target.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  target.lineTo(x + r, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
}

function outlineGeometry(size: number, radius: number, thickness: number): ShapeGeometry {
  const shape = new Shape();
  roundedRect(shape, size, size, radius);
  const hole = new Path();
  roundedRect(hole, size - thickness * 2, size - thickness * 2, Math.max(0.01, radius - thickness));
  shape.holes.push(hole);
  return new ShapeGeometry(shape, 10).rotateX(-Math.PI / 2);
}

interface TileView {
  cell: Cell;
  group: Group;
  baseX: number;
  mats: MeshPhysicalMaterial[];
  hover: number;
  hoverTarget: number;
  flash: number;
  flashColor: Color;
  shake: boolean;
}

export class BoardView {
  readonly group = new Group();
  readonly hitTargets: Mesh[] = [];
  private readonly tiles: TileView[] = [];
  private readonly indicator: Mesh;
  private readonly indicatorMat: MeshBasicMaterial;
  private readonly hint: Mesh;
  private readonly hintMat: MeshBasicMaterial;
  private indicatorCell: Cell | null = null;
  private hintCell: Cell | null = null;
  private readonly glow = new Color('#ffffff');
  private readonly tmp = new Color();

  constructor(anisotropy: number) {
    const ceramic = new MeshPhysicalMaterial({
      color: '#f4ebdd',
      roughness: 0.5,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
    });

    // Base do tabuleiro (casas + cabeçalhos)
    const slab = new Mesh(new RoundedBoxGeometry(HALF_W * 2, 0.34, BOARD_Z1 - BOARD_Z0, 6, 0.17), ceramic);
    slab.position.set(0, -0.17, (BOARD_Z0 + BOARD_Z1) / 2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    // Rebaixo mais escuro que emoldura a grade
    const gridSize = 3 * PITCH + TILE + 0.18;
    const well = new Mesh(
      new RoundedBoxGeometry(gridSize, 0.04, gridSize, 3, 0.02),
      new MeshPhysicalMaterial({ color: '#e3d5c0', roughness: 0.75 }),
    );
    well.position.set(0, 0, 0);
    well.receiveShadow = true;
    this.group.add(well);

    // Casas
    const tileGeo = new RoundedBoxGeometry(TILE, 0.16, TILE, 4, 0.09);
    const decalGeo = new PlaneGeometry(0.84, 0.84).rotateX(-Math.PI / 2);
    const hitGeo = new BoxGeometry(PITCH, 0.5, PITCH);
    const hitMat = new MeshBasicMaterial({ visible: false });
    for (const col of COLORS) {
      const info = PALETTE[col];
      for (const row of VALUES) {
        const glaze = { roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.14 };
        const body = new MeshPhysicalMaterial({ color: info.tint, ...glaze });
        const map = tileTexture(info, row);
        map.anisotropy = anisotropy;
        const face = new MeshPhysicalMaterial({
          map,
          alphaTest: 0.5,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          ...glaze,
        });
        const g = new Group();
        g.position.set(colX(col), 0, rowZ(row));
        const tile = new Mesh(tileGeo, body);
        tile.position.y = TILE_TOP - 0.08;
        tile.castShadow = true;
        tile.receiveShadow = true;
        const decal = new Mesh(decalGeo, face);
        decal.position.y = TILE_TOP + 0.002;
        decal.receiveShadow = true;
        g.add(tile, decal);
        this.group.add(g);
        this.tiles.push({
          cell: { col, row },
          group: g,
          baseX: g.position.x,
          mats: [body, face],
          hover: 0,
          hoverTarget: 0,
          flash: 0,
          flashColor: new Color(),
          shake: false,
        });

        const hit = new Mesh(hitGeo, hitMat);
        hit.position.set(colX(col), TILE_TOP, rowZ(row));
        hit.userData.cell = { col, row } satisfies Cell;
        this.group.add(hit);
        this.hitTargets.push(hit);
      }

      // Cabeçalho colorido com o símbolo da coluna
      const head = new Mesh(
        new RoundedBoxGeometry(0.94, 0.14, 0.6, 4, 0.07),
        new MeshPhysicalMaterial({ color: info.hex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
      );
      head.position.set(colX(col), 0.03, HEADER_Z);
      head.castShadow = true;
      head.receiveShadow = true;
      const mark = headerTexture(info);
      mark.anisotropy = anisotropy;
      const headDecal = new Mesh(
        new PlaneGeometry(0.8, 0.5).rotateX(-Math.PI / 2),
        new MeshPhysicalMaterial({ map: mark, transparent: true, depthWrite: false, roughness: 0.35, clearcoat: 1 }),
      );
      headDecal.position.set(colX(col), 0.103, HEADER_Z);
      this.group.add(head, headDecal);
    }

    // Bandeja onde as peças começam
    const tray = new Mesh(new RoundedBoxGeometry(HALF_W * 2, 0.34, TRAY_D, 6, 0.15), ceramic);
    tray.position.set(0, TRAY_TOP - 0.17, TRAY_Z);
    tray.castShadow = true;
    tray.receiveShadow = true;
    this.group.add(tray);
    const slotGeo = new PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2);
    for (const col of COLORS) {
      const t = slotTexture(PALETTE[col]);
      t.anisotropy = anisotropy;
      const slot = new Mesh(slotGeo, new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      slot.position.set(colX(col), TRAY_TOP + 0.003, TRAY_Z);
      this.group.add(slot);
    }

    // Moldura que indica onde a peça vai cair
    const ring = outlineGeometry(1.12, 0.16, 0.075);
    this.indicatorMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false });
    this.indicator = new Mesh(ring, this.indicatorMat);
    this.indicator.visible = false;
    this.indicator.renderOrder = 3;
    this.hintMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false });
    this.hint = new Mesh(outlineGeometry(1.2, 0.18, 0.06), this.hintMat);
    this.hint.visible = false;
    this.hint.renderOrder = 2;
    this.group.add(this.indicator, this.hint);
  }

  private tile(cell: Cell): TileView | undefined {
    return this.tiles.find((t) => sameCell(t.cell, cell));
  }

  cellFromPoint(x: number, z: number): Cell | null {
    const i = Math.round(x / PITCH + 1.5);
    const r = Math.round(z / PITCH + 2.5);
    if (i < 0 || i > 3 || r < 1 || r > 4) return null;
    return { col: COLORS[i], row: r as Value };
  }

  /** Altura da superfície sob um ponto (para a sombra de contato). */
  surfaceY(x: number, z: number): number {
    const cell = this.cellFromPoint(x, z);
    if (cell && Math.abs(x - colX(cell.col)) < TILE / 2 && Math.abs(z - rowZ(cell.row)) < TILE / 2) return TILE_TOP;
    if (Math.abs(x) < HALF_W && z > BOARD_Z0 && z < BOARD_Z1) return BOARD_TOP;
    if (Math.abs(x) < HALF_W && Math.abs(z - TRAY_Z) < TRAY_D / 2) return TRAY_TOP;
    return TABLE_Y;
  }

  setIndicator(cell: Cell | null, hex = '#ffffff'): void {
    if (sameCell(cell, this.indicatorCell)) {
      if (cell) this.indicatorMat.color.set(hex);
      return;
    }
    const prev = this.indicatorCell && this.tile(this.indicatorCell);
    if (prev) prev.hoverTarget = 0;
    this.indicatorCell = cell;
    this.indicator.visible = !!cell;
    if (!cell) return;
    const t = this.tile(cell);
    if (t) t.hoverTarget = 1;
    this.indicatorMat.color.set(hex);
    this.indicator.position.set(colX(cell.col), TILE_TOP + 0.02, rowZ(cell.row));
  }

  setHint(cell: Cell | null): void {
    this.hintCell = cell;
    this.hint.visible = !!cell;
    if (cell) this.hint.position.set(colX(cell.col), TILE_TOP + 0.012, rowZ(cell.row));
  }

  flashError(cell: Cell): void {
    const t = this.tile(cell);
    if (!t) return;
    t.flash = 1;
    t.flashColor.set('#ff5a3c');
    t.shake = true;
  }

  flashSuccess(cell: Cell, hex: string): void {
    const t = this.tile(cell);
    if (!t) return;
    t.flash = 1;
    t.flashColor.set(hex).lerp(this.glow, 0.45);
    t.shake = false;
  }

  update(dt: number, time: number): void {
    const k = 1 - Math.exp(-dt * 18);
    for (const t of this.tiles) {
      t.hover += (t.hoverTarget - t.hover) * k;
      t.flash = Math.max(0, t.flash - dt * 2.6);
      t.group.position.y = t.hover * 0.025;
      t.group.position.x = t.baseX + (t.shake && t.flash > 0 ? Math.sin(time * 70) * 0.04 * t.flash : 0);
      this.tmp.copy(this.glow).multiplyScalar(t.hover * 0.16);
      this.tmp.r += t.flashColor.r * t.flash * 0.55;
      this.tmp.g += t.flashColor.g * t.flash * 0.55;
      this.tmp.b += t.flashColor.b * t.flash * 0.55;
      for (const m of t.mats) m.emissive.copy(this.tmp);
    }
    if (this.indicatorCell) {
      const s = 1 + Math.sin(time * 9) * 0.022;
      this.indicator.scale.set(s, 1, s);
      this.indicator.position.y = TILE_TOP + 0.02 + 0.025;
      this.indicatorMat.opacity = 0.9;
    }
    if (this.hintCell) {
      const s = 1 + Math.sin(time * 5) * 0.035;
      this.hint.scale.set(s, 1, s);
      this.hintMat.opacity = 0.55 + Math.sin(time * 5) * 0.35;
    }
  }
}

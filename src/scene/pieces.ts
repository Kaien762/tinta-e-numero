import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SplineCurve,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { PALETTE } from '../game/palette';
import { COLORS, HOME, type ColorId, type Position } from '../game/rules';
import { symbolShape } from './symbols';

/** Altura do colar da base, onde o símbolo se apoia. */
const COLLAR_Y = 0.4;
const HEAD_SIZE = 0.56;
/** Inclinação do símbolo para encarar a câmera. */
const HEAD_TILT = -0.42;

function bodyGeometry(): LatheGeometry {
  const profile = new SplineCurve([
    new Vector2(0.0, 0.035),
    new Vector2(0.36, 0.035),
    new Vector2(0.415, 0.07),
    new Vector2(0.41, 0.12),
    new Vector2(0.335, 0.17),
    new Vector2(0.215, 0.215),
    new Vector2(0.165, 0.275),
    new Vector2(0.17, 0.322),
    new Vector2(0.215, 0.352),
    new Vector2(0.215, 0.382),
    new Vector2(0.15, 0.402),
    new Vector2(0.0, 0.408),
  ]).getPoints(72);
  return new LatheGeometry(profile, 56);
}

function footGeometry(): LatheGeometry {
  return new LatheGeometry(
    [new Vector2(0, 0), new Vector2(0.33, 0), new Vector2(0.355, 0.012), new Vector2(0.36, 0.045), new Vector2(0, 0.045)],
    56,
  );
}

function headGeometry(color: ColorId): BufferGeometry {
  const depth = 0.11;
  const g = new ExtrudeGeometry(symbolShape(PALETTE[color].symbol, HEAD_SIZE), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.035,
    bevelSegments: 5,
    curveSegments: 28,
  });
  g.computeBoundingBox();
  const b = g.boundingBox!;
  // pivô na base do símbolo, centrado em x e na espessura
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeVertexNormals();
  return g;
}

export class PieceView {
  readonly color: ColorId;
  readonly group = new Group();
  readonly hit: Mesh;
  readonly ghost = new Group();
  readonly blob: Mesh;
  readonly halo: Mesh;
  /** Onde a base da peça está apoiada (animado). */
  readonly foot = new Vector3();
  arc = 0;
  lift = 0;
  liftTarget = 0;
  shakeX = 0;
  selected = false;
  dragging = false;
  rest: Position = HOME;
  private readonly blobMat: MeshBasicMaterial;
  private readonly haloMat: MeshBasicMaterial;

  constructor(color: ColorId, shared: { body: BufferGeometry; foot: BufferGeometry; blob: Texture }) {
    this.color = color;
    const hex = PALETTE[color].hex;
    const glaze = new MeshPhysicalMaterial({ color: hex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.07 });
    const biscuit = new MeshPhysicalMaterial({ color: '#efe4d3', roughness: 0.85 });
    const headGeo = headGeometry(color);

    const body = new Mesh(shared.body, glaze);
    const foot = new Mesh(shared.foot, biscuit);
    const headPivot = new Group();
    headPivot.position.y = COLLAR_Y - 0.035;
    headPivot.rotation.x = HEAD_TILT;
    const head = new Mesh(headGeo, glaze);
    headPivot.add(head);
    for (const m of [body, foot, head]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(foot, body, headPivot);

    // área de toque maior que a peça (dedo no celular)
    this.hit = new Mesh(new CylinderGeometry(0.42, 0.42, 1.0, 16), new MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.5;
    this.hit.userData.color = color;
    this.group.add(this.hit);

    // fantasma que mostra onde a peça vai cair
    const ghostMat = new MeshStandardMaterial({ color: hex, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.4 });
    const gBody = new Mesh(shared.body, ghostMat);
    const gPivot = new Group();
    gPivot.position.copy(headPivot.position);
    gPivot.rotation.copy(headPivot.rotation);
    gPivot.add(new Mesh(headGeo, ghostMat));
    this.ghost.add(gBody, gPivot);
    this.ghost.visible = false;
    this.ghost.renderOrder = 4;

    this.blobMat = new MeshBasicMaterial({ map: shared.blob, transparent: true, depthWrite: false, opacity: 0.5 });
    this.blob = new Mesh(new PlaneGeometry(1.05, 1.05).rotateX(-Math.PI / 2), this.blobMat);
    this.blob.renderOrder = 1;

    this.haloMat = new MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 });
    this.halo = new Mesh(new RingGeometry(0.47, 0.57, 56).rotateX(-Math.PI / 2), this.haloMat);
    this.halo.visible = false;
    this.halo.renderOrder = 2;
  }

  update(dt: number, time: number, surfaceY: number): void {
    this.lift += (this.liftTarget - this.lift) * (1 - Math.exp(-dt * 16));
    const bob = this.selected && !this.dragging ? Math.sin(time * 5.2) * 0.04 : 0;
    const h = this.arc + this.lift + bob;
    this.group.position.set(this.foot.x + this.shakeX, this.foot.y + h, this.foot.z);

    const air = Math.max(0, this.foot.y + h - surfaceY);
    this.blob.position.set(this.foot.x + this.shakeX, surfaceY + 0.006, this.foot.z);
    const s = 1 + air * 0.6;
    this.blob.scale.set(s, 1, s);
    this.blobMat.opacity = 0.55 / (1 + air * 2.4);

    this.halo.visible = this.selected;
    if (this.selected) {
      const p = 1 + Math.sin(time * 6) * 0.05;
      this.halo.position.set(this.foot.x, surfaceY + 0.012, this.foot.z);
      this.halo.scale.set(p, 1, p);
      this.haloMat.opacity = 0.65 + Math.sin(time * 6) * 0.25;
    }
  }
}

export function buildPieces(blob: Texture): Record<ColorId, PieceView> {
  const shared = { body: bodyGeometry(), foot: footGeometry(), blob };
  const out = {} as Record<ColorId, PieceView>;
  for (const c of COLORS) out[c] = new PieceView(c, shared);
  return out;
}

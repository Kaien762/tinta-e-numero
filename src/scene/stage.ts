import {
  Box3,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BG = '#eee4d4';
const DISTANCE = 15;

/** Renderizador, luz e câmera fixa inclinada que se ajusta à área livre da tela. */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(26, 1, 0.5, 160);
  /** Caixa que precisa caber inteira na área livre (tabuleiro, bandeja e altura das peças). */
  readonly bounds = new Box3();
  private readonly fog = new Fog(BG, 30, 60);
  private readonly tmp = new Vector3();
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    const r = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = NeutralToneMapping; // preserva as cores: a peça precisa ter a cor das letras
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap;
    this.renderer = r;

    this.scene.background = new Color(BG);
    this.scene.fog = this.fog;

    const pmrem = new PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.scene.add(new HemisphereLight('#fff6e9', '#c8b192', 0.9));

    const key = new DirectionalLight('#fff0dc', 2.3);
    key.position.set(-4.5, 10, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 2;
    sc.far = 30;
    key.shadow.radius = 4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);

    const rim = new DirectionalLight('#dfe7ff', 0.6);
    rim.position.set(6, 5, -7);
    this.scene.add(rim);
  }

  /**
   * Enquadra `bounds` dentro de `free` (em px da janela). A perspectiva fica sempre igual;
   * o zoom e um deslocamento de lente (setViewOffset) fazem o encaixe.
   */
  fit(free: Rect): void {
    const W = window.innerWidth, H = window.innerHeight;
    this.width = W;
    this.height = H;
    this.renderer.setSize(W, H);

    const cam = this.camera;
    const fw = Math.max(60, free.w), fh = Math.max(60, free.h);
    const aspect = fw / fh;
    // Retrato: câmera mais alta (casas maiores). Paisagem: mais deitada.
    const k = MathUtils.clamp((aspect - 0.65) / (1.5 - 0.65), 0, 1);
    const elev = MathUtils.degToRad(MathUtils.lerp(66, 56, k));
    const center = this.bounds.getCenter(this.tmp);
    const tx = center.x, tz = center.z;
    cam.position.set(tx, Math.sin(elev) * DISTANCE, tz + Math.cos(elev) * DISTANCE);
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, 0, tz);
    cam.aspect = aspect;
    cam.zoom = 1;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const b = this.bounds;
    for (let i = 0; i < 8; i++) {
      const p = this.tmp
        .set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)
        .project(cam);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const margin = 0.96;
    const zoom = Math.min((2 * margin) / (maxX - minX), (2 * margin) / (maxY - minY));
    cam.zoom = zoom;
    const cx = ((minX + maxX) / 2) * zoom;
    const cy = ((minY + maxY) / 2) * zoom;
    cam.setViewOffset(fw, fh, (cx * fw) / 2 - free.x, (-cy * fh) / 2 - free.y, W, H);
    this.fog.near = DISTANCE + 6;
    this.fog.far = DISTANCE + 34;
  }

  /** Posição na tela (px da janela) de um ponto do mundo. */
  project(v: Vector3): { x: number; y: number } {
    const p = this.tmp.copy(v).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

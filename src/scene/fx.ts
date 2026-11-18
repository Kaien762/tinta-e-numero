import {
  BoxGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  Vector3,
} from 'three';
import { HALO, LINE_DARK, PALETTE } from '../game/palette';
import { COLORS, type ColorId } from '../game/rules';

interface Particle {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  life: number;
  max: number;
}

/** Confete de cerâmica no acerto e a seta que aponta a peça no tutorial. */
export class Fx {
  readonly group = new Group();
  private readonly pool: Mesh[] = [];
  private readonly live: Particle[] = [];
  private readonly mats: Record<ColorId, MeshStandardMaterial>;
  private readonly cream = new MeshStandardMaterial({ color: HALO, roughness: 0.4 });
  private readonly arrow = new Group();

  constructor() {
    this.mats = {} as Record<ColorId, MeshStandardMaterial>;
    for (const c of COLORS) this.mats[c] = new MeshStandardMaterial({ color: PALETTE[c].hex, roughness: 0.35 });
    const geo = new BoxGeometry(0.12, 0.025, 0.08);
    for (let i = 0; i < 140; i++) {
      const m = new Mesh(geo, this.cream);
      m.visible = false;
      this.pool.push(m);
      this.group.add(m);
    }

    const s = new Shape();
    s.moveTo(-0.1, 0.4);
    s.lineTo(0.1, 0.4);
    s.lineTo(0.1, 0.1);
    s.lineTo(0.25, 0.1);
    s.lineTo(0, -0.2);
    s.lineTo(-0.25, 0.1);
    s.lineTo(-0.1, 0.1);
    s.closePath();
    const arrowGeo = new ExtrudeGeometry(s, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    arrowGeo.translate(0, 0, -0.04);
    const arrowMesh = new Mesh(
      arrowGeo,
      new MeshPhysicalMaterial({ color: LINE_DARK, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    );
    arrowMesh.castShadow = true;
    arrowMesh.rotation.x = -0.5;
    this.arrow.add(arrowMesh);
    this.arrow.visible = false;
    this.group.add(this.arrow);
  }

  burst(color: ColorId, at: Vector3, count = 14, power = 1): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.find((m) => !m.visible);
      if (!mesh) return;
      mesh.material = i % 3 === 0 ? this.cream : this.mats[color];
      mesh.visible = true;
      mesh.position.set(at.x, at.y + 0.45, at.z);
      mesh.scale.setScalar(1);
      const a = Math.random() * Math.PI * 2;
      const r = (0.9 + Math.random() * 1.3) * power;
      this.live.push({
        mesh,
        vel: new Vector3(Math.cos(a) * r, (2.4 + Math.random() * 1.6) * power, Math.sin(a) * r),
        spin: new Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7),
        life: 0,
        max: (0.55 + Math.random() * 0.25) * (power > 1 ? 1.6 : 1),
      });
    }
  }

  update(dt: number, time: number, arrowAt: Vector3 | null): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      p.vel.y -= 9.5 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const k = p.life / p.max;
      p.mesh.scale.setScalar(k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1);
      if (k >= 1) {
        p.mesh.visible = false;
        this.live.splice(i, 1);
      }
    }
    this.arrow.visible = !!arrowAt;
    if (arrowAt) this.arrow.position.set(arrowAt.x, arrowAt.y + 1.3 + Math.sin(time * 4.5) * 0.09, arrowAt.z);
  }
}

import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, shiftedColor, TAU } from './three-family-natural-shared';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Whirl forms streaming wind blades; generic vortex collapses concentric shells. */
export class AirNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly wind: boolean;
  private readonly blades: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly core: THREE.Mesh;

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    this.wind = Number.isFinite(ctx.params.spirals) || Number.isFinite(ctx.params.gust);
    if (this.wind) this.createWind(); else this.createVortex();
    this.core = new THREE.Mesh(
      this.wind ? new THREE.ConeGeometry(13, 38, 10) : new THREE.IcosahedronGeometry(15, 1),
      physicalMaterial(shiftedColor(ctx.color, 0.01, 0.08), ctx.energy, 'smoke'),
    );
    this.core.position.set(ctx.origin.x, ctx.origin.y, 28); this.group.add(this.core);
  }

  update(t: number, now: number): void {
    if (this.wind) this.updateWind(t, now); else this.updateVortex(t, now);
  }

  private createWind(): void {
    const spirals = clamp(this.ctx.params.spirals ?? 1, 0.8, 3);
    const count = Math.round(18 + spirals * 5);
    for (let i = 0; i < count; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(24 + i % 4 * 8, 2.2, 1.8), additiveMaterial(shiftedColor(this.ctx.color, 0.02, i % 3 * 0.04), 0.54));
      this.group.add(blade); this.blades.push(blade);
    }
  }

  private createVortex(): void {
    for (let i = 0; i < 8; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(28 + i * 11, 1.6 + i * 0.18, 8, 56), additiveMaterial(shiftedColor(this.ctx.color, i * 0.008, i * 0.018), 0.56 - i * 0.035));
      ring.position.set(this.ctx.origin.x, this.ctx.origin.y, 16 - i * 2); ring.rotation.x = 0.28 + i * 0.11; ring.rotation.y = -0.22 + i * 0.07;
      this.group.add(ring); this.rings.push(ring);
    }
  }

  private updateWind(t: number, now: number): void {
    const fade = fadeAt(t, 0.74); const spirals = clamp(this.ctx.params.spirals ?? 1, 0.8, 3);
    const suction = clamp(this.ctx.params.suction ?? 1, 0.5, 2.8); const gust = clamp(this.ctx.params.gust ?? 1, 0.5, 3);
    const rise = 1 - Math.pow(1 - t, 2.2);
    for (let i = 0; i < this.blades.length; i++) {
      const u = i / this.blades.length; const phase = u * TAU * spirals + now * 0.0052 * gust;
      const radius = (18 + u * 76) * (1 - t * 0.26 * suction);
      const vertical = -92 + ((u * 210 + rise * 180) % 210);
      const blade = this.blades[i]; blade.position.set(this.ctx.origin.x + Math.cos(phase) * radius, this.ctx.origin.y + vertical, 12 + Math.sin(phase) * 18);
      blade.rotation.set(0.34 + u * 0.5, phase, phase + Math.PI / 2); blade.scale.x = 0.72 + Math.sin(phase * 2) * 0.22;
      setOpacity(blade, fade * (0.3 + (1 - u) * 0.42));
    }
    this.core.position.set(this.ctx.origin.x + Math.sin(now * 0.003) * 5 * gust, this.ctx.origin.y - 58 + rise * 118, 28);
    this.core.rotation.set(0, now * 0.008 * spirals, Math.sin(now * 0.004) * 0.18); this.core.scale.set(0.7 + suction * 0.18, 0.5 + suction * 0.2, 0.7 + suction * 0.18); setOpacity(this.core, fade * 0.75);
  }

  private updateVortex(t: number, now: number): void {
    const fade = fadeAt(t, 0.72); const spin = this.ctx.profile.spin; const collapse = 1 - Math.pow(t, 1.8) * 0.72;
    for (let i = 0; i < this.rings.length; i++) {
      const phase = (t * (1.1 + i * 0.05) + i * 0.09) % 1; const ring = this.rings[i];
      ring.scale.setScalar(Math.max(0.12, collapse * (1.2 - i * 0.045) + Math.sin(phase * Math.PI) * 0.18));
      ring.rotation.z = now * 0.0012 * spin * (i % 2 ? -1 : 1); ring.rotation.x = 0.28 + i * 0.11 + Math.sin(now * 0.0016 + i) * 0.16;
      ring.position.z = 16 - i * 2 + Math.sin(now * 0.002 + i) * 8; setOpacity(ring, fade * (0.55 - i * 0.04));
    }
    this.core.rotation.set(now * 0.004, now * 0.007 * spin, now * 0.003);
    this.core.scale.setScalar(0.62 + t * 0.85 + Math.sin(now * 0.012) * 0.08); setOpacity(this.core, fade * (0.72 + t * 0.2));
  }
}

/** Local rain cell: cloud canopy, staggered drops and a single puddle. */
export class RainNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly rain: THREE.InstancedMesh;
  private readonly clouds: THREE.Mesh[] = [];
  private readonly puddle: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(24 + i % 3 * 9, 14, 8), additiveMaterial(shiftedColor(ctx.color, -0.03, -0.04), 0.2));
      cloud.position.set(ctx.origin.x + (i - 2) * 28, ctx.origin.y + 78 + Math.sin(i * 2.2) * 8, 14 + i % 2 * 7); cloud.scale.y = 0.52;
      this.group.add(cloud); this.clouds.push(cloud);
    }
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 30, 1), additiveMaterial(ctx.color, 0.6), 42);
    this.rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.rain);
    this.puddle = new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 8, 48), additiveMaterial(shiftedColor(ctx.color, 0.01, 0.1), 0.56));
    this.puddle.position.set(ctx.origin.x, ctx.origin.y - 94, 7); this.puddle.scale.y = 0.3; this.group.add(this.puddle);
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.76); const angle = Math.atan2(this.ctx.direction.y, this.ctx.direction.x) - Math.PI / 2;
    this.quaternion.setFromAxisAngle(Z_AXIS, angle);
    for (let i = 0; i < this.rain.count; i++) {
      const lane = i % 14; const cycle = ((t * 2.3 + Math.floor(i / 14) * 0.27 + lane * 0.061) % 1);
      const x = this.ctx.origin.x - 118 + lane * 18 + this.ctx.direction.x * cycle * 46;
      const y = this.ctx.origin.y + 62 - cycle * 176 + Math.floor(i / 14) * 10;
      this.position.set(x, y, 10 + i % 4 * 3); this.scale.set(0.7 + i % 3 * 0.15, 0.75 + i % 4 * 0.12, 1); this.matrix.compose(this.position, this.quaternion, this.scale); this.rain.setMatrixAt(i, this.matrix);
    }
    this.rain.instanceMatrix.needsUpdate = true; setOpacity(this.rain, fade * 0.62);
    for (let i = 0; i < this.clouds.length; i++) { this.clouds[i].position.x = this.ctx.origin.x + (i - 2) * 28 + Math.sin(now * 0.0014 + i) * 8; this.clouds[i].scale.x = 1 + Math.sin(now * 0.002 + i) * 0.08; setOpacity(this.clouds[i], fade * (0.15 + i * 0.018)); }
    const p = (t * 2.4) % 1; this.puddle.scale.set(0.3 + p * 2.5, (0.3 + p * 2.5) * 0.3, 1); setOpacity(this.puddle, fade * (1 - p) * 0.6);
  }
}

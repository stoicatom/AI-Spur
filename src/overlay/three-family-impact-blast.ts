import * as THREE from 'three';
import {
  additiveMaterial,
  additiveLineMaterial,
  fadeAt,
  physicalMaterial,
  setOpacity,
  type FamilyContext,
  type FamilyLayer,
} from './three-family-shared';

const TAU = Math.PI * 2;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeOut = (value: number): number => 1 - Math.pow(1 - clamp01(value), 3);

function radialLines(color: THREE.Color, count: number, inner: number, outer: number): THREE.LineSegments {
  const data = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + (i % 3) * 0.04;
    data[i * 6] = Math.cos(angle) * inner;
    data[i * 6 + 1] = Math.sin(angle) * inner;
    data[i * 6 + 3] = Math.cos(angle) * (outer + (i % 4) * 9);
    data[i * 6 + 4] = Math.sin(angle) * (outer + (i % 4) * 9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
  return new THREE.LineSegments(geometry, additiveLineMaterial(color, 0.82));
}

/** Fireball, wire pressure shell, radiation flash and ballistic fragments. */
export class BombImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly fireball: THREE.Mesh;
  private readonly shell: THREE.Mesh;
  private readonly rays: THREE.LineSegments;
  private readonly debris: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin, params } = ctx;
    this.group.position.copy(origin);
    ctx.root.add(this.group);
    this.fireball = new THREE.Mesh(new THREE.IcosahedronGeometry(27 * energy, 2), physicalMaterial(color, energy * 1.2, 'fire'));
    this.fireball.position.z = 46;
    this.group.add(this.fireball);
    const shellMaterial = additiveMaterial(color, 0.72);
    shellMaterial.wireframe = true;
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(42, 24, 16), shellMaterial);
    this.shell.position.z = 30;
    this.group.add(this.shell);
    this.rays = radialLines(color, 22, 24, 118);
    this.rays.position.z = 34;
    this.group.add(this.rays);
    const count = Math.max(12, Math.min(28, Math.round(10 + (params.debris ?? 1) * 7)));
    this.debris = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(6, 0), additiveMaterial(color, 0.78), count);
    this.group.add(this.debris);
  }

  update(t: number, now: number): void {
    const ignition = easeOut(t / 0.16);
    const burst = easeOut((t - 0.08) / 0.58);
    const fade = fadeAt(t, 0.66);
    const blast = this.ctx.params.blast ?? 1;
    const shock = this.ctx.params.shockwave ?? 1;
    const flamePulse = Math.sin(Math.min(1, t / 0.5) * Math.PI);
    this.fireball.scale.setScalar(0.18 + ignition * 0.7 + flamePulse * (0.72 + blast * 0.2));
    this.fireball.rotation.set(now * 0.0021, now * 0.0034, now * 0.0017);
    setOpacity(this.fireball, fade * (1 - burst * 0.62));
    this.shell.scale.setScalar(0.12 + burst * (3.4 + shock * 0.55));
    setOpacity(this.shell, fade * (1 - burst) * 0.82);
    this.rays.scale.setScalar(0.22 + burst * (1.2 + blast * 0.12));
    this.rays.rotation.z = now * 0.00025;
    setOpacity(this.rays, fade * Math.sin(burst * Math.PI));

    for (let i = 0; i < this.debris.count; i++) {
      const angle = (i / this.debris.count) * TAU + (i % 3) * 0.11;
      const speed = (55 + (i % 7) * 13) * (0.72 + blast * 0.16);
      this.position.set(
        Math.cos(angle) * burst * speed,
        Math.sin(angle) * burst * speed - burst * burst * (25 + (i % 4) * 8),
        18 + (i % 6) * 6,
      );
      this.quaternion.setFromAxisAngle(Z_AXIS, angle + now * 0.003 * (i % 2 ? -1 : 1));
      this.scale.setScalar((0.42 + (i % 3) * 0.16) * fade * burst);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.debris.setMatrixAt(i, this.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    setOpacity(this.debris, fade * burst);
  }
}

/** Hollow spectral cage with independently drifting fragments for mythic bursts. */
export class SpectralImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly cage: THREE.Mesh;
  private readonly fragments: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin } = ctx;
    this.group.position.copy(origin);
    ctx.root.add(this.group);
    const cageMaterial = additiveMaterial(color, 0.58);
    cageMaterial.wireframe = true;
    this.cage = new THREE.Mesh(new THREE.IcosahedronGeometry(38 * energy, 1), cageMaterial);
    this.cage.position.z = 34;
    this.group.add(this.cage);
    const count = Math.max(10, Math.min(26, Math.round(8 + (ctx.params.count ?? 2) * 5)));
    this.fragments = new THREE.InstancedMesh(new THREE.OctahedronGeometry(5, 0), additiveMaterial(color, 0.74), count);
    this.group.add(this.fragments);
  }

  update(t: number, now: number): void {
    const bloom = easeOut(t / 0.55);
    const fade = fadeAt(t, 0.66);
    const drift = this.ctx.params.drift ?? 1;
    const ghostly = this.ctx.params.ghostly ?? 1;
    this.cage.scale.setScalar(0.18 + bloom * (1.2 + ghostly * 0.25));
    this.cage.rotation.set(now * 0.0011, now * 0.0016, now * 0.0008);
    setOpacity(this.cage, fade * (1 - bloom * 0.35));
    for (let i = 0; i < this.fragments.count; i++) {
      const angle = (i / this.fragments.count) * TAU + bloom * (1.2 + drift * 0.25);
      const radius = 18 + bloom * (55 + (i % 6) * 12) * drift;
      this.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius + bloom * (20 + i % 4 * 8),
        18 + i % 7 * 5,
      );
      this.quaternion.setFromAxisAngle(Z_AXIS, angle + now * 0.002 * (i % 2 ? -1 : 1));
      this.scale.setScalar((0.36 + (i % 3) * 0.2) * fade);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.fragments.setMatrixAt(i, this.matrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    setOpacity(this.fragments, fade);
  }
}

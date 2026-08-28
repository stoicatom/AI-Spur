import * as THREE from 'three';
import {
  additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer,
} from './three-family-shared';
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeOut = (value: number): number => 1 - Math.pow(1 - clamp01(value), 3);

/** Weighted axe body, luminous cleave arc and wedge-shaped chips. */
export class AxeImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly axe = new THREE.Group();
  private readonly arc: THREE.Mesh;
  private readonly wedges: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly axeParts: THREE.Mesh[] = [];
  private readonly angle: number;

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin, direction, params } = ctx;
    this.angle = Math.atan2(direction.y, direction.x);
    this.group.position.copy(origin);
    ctx.root.add(this.group);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(104, 7, 7), physicalMaterial(color, energy, 'wood'));
    handle.position.x = -30;
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(31 * (params.cleave ?? 1), 58, 3),
      physicalMaterial(color, energy * 1.12, 'metal'),
    );
    blade.position.x = 30;
    blade.rotation.z = -Math.PI / 2;
    blade.scale.set(0.7, 1, 0.45);
    this.axe.add(handle, blade);
    this.axeParts.push(handle, blade);
    this.group.add(this.axe);

    this.arc = new THREE.Mesh(
      new THREE.TorusGeometry(82, 4.5, 8, 72, Math.PI * 1.3),
      additiveMaterial(color, 0.9),
    );
    this.arc.rotation.z = this.angle - Math.PI * 0.64;
    this.group.add(this.arc);

    const count = Math.max(8, Math.min(18, Math.round(7 + (params.cleave ?? 1) * 4)));
    this.wedges = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(7, 0),
      additiveMaterial(color, 0.76),
      count,
    );
    this.group.add(this.wedges);
  }

  update(t: number, now: number): void {
    const chop = Math.max(0.7, Math.min(2.6, this.ctx.params.chop ?? 1));
    const strike = easeOut((t - 0.1) / (0.46 / chop));
    const release = easeOut((t - 0.48) / 0.42);
    const contact = clamp01((t - 0.24) / 0.3);
    const fade = fadeAt(t, 0.68);
    const weight = this.ctx.params.weight ?? 1;
    const cleave = this.ctx.params.cleave ?? 1;
    this.axe.rotation.z = this.angle - 1.15 + strike * 2.22 - release * 0.24;
    this.axe.position.set(-this.ctx.direction.x * release * 18, -this.ctx.direction.y * release * 18, 38);
    this.axe.scale.set(1 + strike * 0.08, 1 - strike * 0.05, 1);
    for (const part of this.axeParts) setOpacity(part, fade);

    const arcLife = Math.sin(contact * Math.PI);
    this.arc.scale.setScalar(0.52 + contact * (1.15 + cleave * 0.16));
    setOpacity(this.arc, fade * arcLife * 0.92);

    const nx = -this.ctx.direction.y;
    const ny = this.ctx.direction.x;
    for (let i = 0; i < this.wedges.count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const lane = 10 + (i % 5) * 8;
      const distance = contact * (42 + i * 8) * (0.78 + cleave * 0.18);
      this.position.set(
        this.ctx.direction.x * distance + nx * side * lane * contact,
        this.ctx.direction.y * distance + ny * side * lane * contact - contact * contact * 34 * weight,
        22 + (i % 4) * 4,
      );
      this.quaternion.setFromAxisAngle(Z_AXIS, this.angle + side * 0.5 + now * 0.002 * side);
      this.scale.setScalar((0.35 + contact * 0.9) * fade);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.wedges.setMatrixAt(i, this.matrix);
    }
    this.wedges.instanceMatrix.needsUpdate = true;
    setOpacity(this.wedges, fade * contact);
  }
}

/** Octagonal shield face that compresses, then bends the pressure wave away. */
export class ShieldImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly shield = new THREE.Group();
  private readonly wave: THREE.Mesh;
  private readonly glint: THREE.Mesh;
  private readonly shieldParts: THREE.Mesh[] = [];
  private readonly angle: number;

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin, direction } = ctx;
    this.angle = Math.atan2(direction.y, direction.x);
    this.group.position.copy(origin);
    ctx.root.add(this.group);

    const face = new THREE.Mesh(new THREE.CylinderGeometry(52, 46, 9, 8), physicalMaterial(color, energy, 'metal'));
    face.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(50, 4.5, 8, 8), additiveMaterial(color, 0.84));
    const boss = new THREE.Mesh(new THREE.OctahedronGeometry(16, 0), physicalMaterial(color, energy * 1.15, 'metal'));
    boss.position.z = 9;
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(7, 75, 5), additiveMaterial(color, 0.62));
    vertical.position.z = 7;
    this.shield.add(face, rim, boss, vertical);
    this.shieldParts.push(face, rim, boss, vertical);
    this.group.add(this.shield);

    this.wave = new THREE.Mesh(
      new THREE.RingGeometry(38, 48, 64, 1, -Math.PI * 0.62, Math.PI * 1.24),
      additiveMaterial(color, 0.82),
    );
    this.wave.rotation.z = this.angle - Math.PI * 0.62;
    this.group.add(this.wave);

    this.glint = new THREE.Mesh(new THREE.PlaneGeometry(8, 118), additiveMaterial(color, 0.7));
    this.glint.rotation.z = this.angle + Math.PI / 2;
    this.group.add(this.glint);
  }

  update(t: number, now: number): void {
    const arrive = easeOut(t / 0.2);
    const impact = clamp01((t - 0.14) / 0.42);
    const recoil = easeOut((t - 0.48) / 0.45);
    const fade = fadeAt(t, 0.72);
    const block = this.ctx.params.block ?? 1;
    const deflection = this.ctx.params.deflection ?? 1;
    const resonance = this.ctx.params.resonance ?? 1;
    const compression = Math.sin(Math.min(1, impact * 1.8) * Math.PI) * 0.12 * block;
    this.shield.position.set(
      -this.ctx.direction.x * (1 - arrive) * 88 - this.ctx.direction.x * recoil * 16,
      -this.ctx.direction.y * (1 - arrive) * 88 - this.ctx.direction.y * recoil * 16,
      42,
    );
    this.shield.rotation.z = this.angle + Math.sin(now * 0.018) * compression;
    this.shield.scale.set(1 - compression, 1 + compression * 0.5, 1);
    for (const part of this.shieldParts) setOpacity(part, fade);

    const bend = easeOut(impact);
    const nx = -this.ctx.direction.y;
    const ny = this.ctx.direction.x;
    this.wave.position.set(
      this.ctx.direction.x * bend * 58 + nx * bend * 42 * deflection,
      this.ctx.direction.y * bend * 58 + ny * bend * 42 * deflection,
      24,
    );
    const resonancePulse = Math.sin(now * 0.012 * resonance) * (1 - bend) * 0.08;
    this.wave.scale.set(0.25 + bend * 3.4 + resonancePulse, 0.42 + bend * 1.45, 1);
    setOpacity(this.wave, fade * Math.sin(impact * Math.PI) * 0.95);
    this.glint.scale.y = 0.2 + Math.sin(impact * Math.PI) * 1.35;
    setOpacity(this.glint, fade * Math.sin(impact * Math.PI));
  }
}

/** Built glove silhouette with knuckles, impact compression and ballistic sweat. */
export class BoxingImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly glove = new THREE.Group();
  private readonly dent: THREE.Mesh;
  private readonly sweat: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly gloveParts: THREE.Mesh[] = [];
  private readonly angle: number;

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin, direction } = ctx;
    this.angle = Math.atan2(direction.y, direction.x);
    this.group.position.copy(origin);
    ctx.root.add(this.group);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(31, 18, 12), physicalMaterial(color, energy, 'leather'));
    palm.scale.set(1.25, 0.92, 0.8);
    this.glove.add(palm);
    this.gloveParts.push(palm);
    for (let i = 0; i < 4; i++) {
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), physicalMaterial(color, energy, 'leather'));
      knuckle.position.set(18 + (i % 2) * 13, (i < 2 ? -1 : 1) * 14, 2 + (i % 2) * 3);
      this.glove.add(knuckle);
      this.gloveParts.push(knuckle);
    }
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(38, 43, 24), additiveMaterial(color, 0.78));
    cuff.position.x = -34;
    this.glove.add(cuff);
    this.gloveParts.push(cuff);
    this.group.add(this.glove);

    this.dent = new THREE.Mesh(new THREE.RingGeometry(30, 43, 8), additiveMaterial(color, 0.82));
    this.group.add(this.dent);
    this.sweat = new THREE.InstancedMesh(new THREE.SphereGeometry(2.8, 7, 5), additiveMaterial(color, 0.72), 12);
    this.group.add(this.sweat);
  }

  update(t: number, now: number): void {
    const mass = Math.max(0.7, Math.min(2.6, this.ctx.params.gloveMass ?? 1));
    const drive = easeOut(t / (0.24 + mass * 0.035));
    const recoil = easeOut((t - 0.34) / (this.ctx.params.recovery ?? 0.68));
    const impact = clamp01((t - 0.2) / 0.32);
    const fade = fadeAt(t, 0.58);
    const force = this.ctx.params.punchForce ?? 1;
    const reach = drive * 122 - recoil * 40;
    this.glove.position.set(this.ctx.direction.x * (reach - 116), this.ctx.direction.y * (reach - 116), 48);
    this.glove.rotation.z = this.angle;
    const compression = Math.sin(impact * Math.PI) * (this.ctx.params.compression ?? 0.35);
    this.glove.scale.set(
      1 + compression * 0.45 + (mass - 1) * 0.04,
      1 - compression * 0.24 + (mass - 1) * 0.025,
      1 - compression * 0.18 + (mass - 1) * 0.025,
    );
    for (const part of this.gloveParts) setOpacity(part, fade);

    const knockback = easeOut(impact) * (this.ctx.params.screenKnockback ?? 1);
    this.dent.position.set(this.ctx.direction.x * knockback * 18, this.ctx.direction.y * knockback * 18, 24);
    this.dent.rotation.z = this.angle + Math.PI / 8;
    this.dent.scale.set(0.18 + knockback * 1.7, 0.15 + knockback * 1.05, 1);
    setOpacity(this.dent, fade * Math.sin(impact * Math.PI) * Math.min(1.2, force));

    const nx = -this.ctx.direction.y;
    const ny = this.ctx.direction.x;
    const spray = this.ctx.params.sweatSpray ?? 1;
    for (let i = 0; i < this.sweat.count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const speed = 42 + (i % 6) * 13;
      this.position.set(
        this.ctx.direction.x * impact * speed + nx * side * impact * (12 + i * 3) * spray,
        this.ctx.direction.y * impact * speed + ny * side * impact * (12 + i * 3) * spray - impact * impact * 45,
        28 + (i % 4) * 4,
      );
      this.quaternion.setFromAxisAngle(Z_AXIS, now * 0.004 * side + i);
      this.scale.setScalar(fade * impact * (0.7 + (i % 3) * 0.18));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.sweat.setMatrixAt(i, this.matrix);
    }
    this.sweat.instanceMatrix.needsUpdate = true;
    setOpacity(this.sweat, fade * impact);
  }
}

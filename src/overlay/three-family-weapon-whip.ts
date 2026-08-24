import * as THREE from 'three';
import { additiveLineMaterial, additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, setWeaponOpacity, TAU, weaponColor, weaponParam } from './three-family-weapon-shared';
import { WHIP_CRACK_IMPACT_PROGRESS } from './effect-timings';

type DustArc = { mesh: THREE.Mesh; phase: number; lane: number };

/** A traveling tension wave rolls through a segmented lash before the tip cracks the air. */
export class BullwhipWeaponStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly handle = new THREE.Group();
  private readonly whip: THREE.Line;
  private readonly points: THREE.BufferAttribute;
  private readonly tip: THREE.Mesh;
  private readonly crack: THREE.Mesh[] = [];
  private readonly dust: DustArc[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.name = 'bullwhip-stage'; this.group.position.copy(ctx.origin);
    this.group.rotation.z = Math.atan2(ctx.direction.y, ctx.direction.x); ctx.root.add(this.group);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 52, 9), physicalMaterial(weaponColor(ctx.color, -0.05, -0.16), ctx.energy, 'leather'));
    grip.name = 'bullwhip-handle'; grip.rotation.z = Math.PI / 2; grip.position.set(-25, 0, 26); this.handle.add(grip); this.group.add(this.handle);
    const data = new Float32Array(36 * 3);
    this.points = new THREE.BufferAttribute(data, 3); this.points.setUsage(THREE.DynamicDrawUsage);
    const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', this.points);
    this.whip = new THREE.Line(lineGeometry, additiveLineMaterial(ctx.color, 0.92)); this.whip.name = 'bullwhip-lash'; this.whip.position.z = 34; this.group.add(this.whip);
    this.tip = new THREE.Mesh(new THREE.OctahedronGeometry(9, 0), physicalMaterial(weaponColor(ctx.color, 0.03, 0.18), ctx.energy, 'metal'));
    this.tip.name = 'bullwhip-tip'; this.group.add(this.tip);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15 + i * 9, 1.8, 8, 38), additiveMaterial(weaponColor(ctx.color, i * 0.016, 0.18), 0.68 - i * 0.13));
      ring.name = `bullwhip-crack-${i}`; this.group.add(ring); this.crack.push(ring);
    }
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Mesh(new THREE.TetrahedronGeometry(3 + i % 3, 0), additiveMaterial(weaponColor(ctx.color, -0.08, 0.08), 0.42));
      cloud.name = `bullwhip-dust-${i}`; this.group.add(cloud); this.dust.push({ mesh: cloud, phase: i / 12, lane: i % 2 ? 1 : -1 });
    }
  }

  update(t: number, _now: number): void {
    const length = clamp(weaponParam(this.ctx.params, 'lashLength', 1), 0.6, 2.7) * 188;
    const snap = clamp(weaponParam(this.ctx.params, 'snapVelocity', 1), 0.5, 3.8);
    const tension = clamp(weaponParam(this.ctx.params, 'waveTension', 1), 0.4, 2.8);
    const tipCrack = clamp(weaponParam(this.ctx.params, 'tipCrack', 1), 0.35, 2.8);
    const dustArc = clamp(weaponParam(this.ctx.params, 'dustArc', 1), 0.15, 2.8);
    const recoil = clamp(weaponParam(this.ctx.params, 'recoil', 1), 0.25, 2.8);
    const travel = clamp(t * (0.82 + snap * 0.24), 0, 1);
    const recoilPulse = Math.sin(clamp(t * 2.8, 0, 1) * Math.PI) * recoil;
    const fade = fadeAt(t, 0.74);
    this.handle.position.set(-recoilPulse * 19, recoilPulse * 4, 0);
    this.handle.rotation.z = -recoilPulse * 0.08; setWeaponOpacity(this.handle, fade);
    let tipX = 0; let tipY = 0;
    for (let i = 0; i < 36; i++) {
      const u = i / 35; const pulse = Math.max(0, 1 - Math.abs(u - travel) * (4.4 + tension));
      const bend = Math.sin(u * Math.PI) * (18 + recoil * 8) + Math.sin((u - travel) * (12 + tension * 6)) * pulse * (22 + snap * 12);
      const x = u * length - recoilPulse * (1 - u) * 18;
      const y = bend * (0.32 + (1 - u) * 0.68);
      const z = 34 + Math.sin(u * Math.PI) * 8 + pulse * 12;
      this.points.setXYZ(i, x, y, z); if (i === 35) { tipX = x; tipY = y; }
    }
    this.points.needsUpdate = true; setOpacity(this.whip, fade);
    this.tip.position.set(tipX, tipY, 46); this.tip.scale.setScalar(0.45 + clamp((t - 0.42) * 3.2, 0, 1) * tipCrack);
    this.tip.rotation.set(t * TAU * snap, t * TAU * tension, t * TAU * tipCrack); setOpacity(this.tip, fade);
    for (let i = 0; i < this.crack.length; i++) {
      const p = clamp((t - WHIP_CRACK_IMPACT_PROGRESS - i * 0.035) * (4 + snap), 0, 1);
      this.crack[i].position.set(tipX, tipY, 20 - i * 2); this.crack[i].scale.setScalar(0.18 + p * (1 + tipCrack * 0.7)); this.crack[i].rotation.z = p * TAU * (0.11 + i * 0.06);
      setOpacity(this.crack[i], fade * (1 - p) * 0.72);
    }
    for (const cloud of this.dust) {
      const p = clamp((t - 0.31 - cloud.phase * 0.26) * (1.65 + snap * 0.18), 0, 1);
      const arc = Math.sin(p * Math.PI); const radial = (22 + p * 86) * dustArc;
      cloud.mesh.position.set(tipX - radial * 0.35, cloud.lane * radial * (0.18 + p * 0.22), 10 + arc * (18 + dustArc * 12));
      cloud.mesh.rotation.set(p * TAU, p * TAU * cloud.lane, p * TAU * 0.5); cloud.mesh.scale.setScalar((0.25 + arc * 0.7) * dustArc);
      setOpacity(cloud.mesh, fade * arc * 0.42);
    }
  }
}

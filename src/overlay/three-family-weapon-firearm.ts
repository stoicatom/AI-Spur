import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, easeOut, setWeaponOpacity, TAU, weaponColor, weaponParam } from './three-family-weapon-shared';

type SmokePuff = { mesh: THREE.Mesh; phase: number; lane: number };
type Casing = { mesh: THREE.Mesh; delay: number; side: number };

/** Revolver recoil: metal body, muzzle bloom, spiralling smoke and brass ejection. */
export class RevolverWeaponStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly revolver = new THREE.Group();
  private readonly muzzle: THREE.Mesh;
  private readonly tracer: THREE.Mesh;
  private readonly bloom: THREE.Mesh[] = [];
  private readonly smoke: SmokePuff[] = [];
  private readonly casings: Casing[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.name = 'revolver-stage';
    this.group.position.copy(ctx.origin);
    this.group.rotation.z = Math.atan2(ctx.direction.y, ctx.direction.x);
    ctx.root.add(this.group);
    this.group.add(this.revolver);

    const steel = physicalMaterial(weaponColor(ctx.color, -0.03, -0.18), ctx.energy, 'metal');
    const brass = physicalMaterial(weaponColor(ctx.color, 0.03, 0.12), ctx.energy * 1.08, 'metal');
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 106, 12), steel);
    barrel.name = 'revolver-barrel'; barrel.position.set(38, 0, 28); barrel.rotation.z = -Math.PI / 2;
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 18, 12), brass);
    chamber.name = 'revolver-chamber'; chamber.position.set(-9, 0, 29); chamber.rotation.x = Math.PI / 2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(29, 66, 17), steel);
    grip.name = 'revolver-grip'; grip.position.set(-34, -31, 24); grip.rotation.z = -0.23;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 6), brass);
    sight.name = 'revolver-sight'; sight.position.set(67, 8, 39);
    this.revolver.add(barrel, chamber, grip, sight);

    this.muzzle = new THREE.Mesh(new THREE.ConeGeometry(20, 60, 9), additiveMaterial(weaponColor(ctx.color, 0.02, 0.18), 0.94));
    this.muzzle.name = 'revolver-muzzle'; this.muzzle.position.set(94, 0, 34); this.muzzle.rotation.z = -Math.PI / 2;
    this.revolver.add(this.muzzle);
    this.tracer = new THREE.Mesh(new THREE.ConeGeometry(3.8, 118, 8), additiveMaterial(weaponColor(ctx.color, 0.04, 0.2), 0.86));
    this.tracer.name = 'revolver-tracer'; this.tracer.rotation.z = -Math.PI / 2; this.group.add(this.tracer);

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(17 + i * 10, 1.8, 8, 40), additiveMaterial(weaponColor(ctx.color, i * 0.015, 0.16), 0.62 - i * 0.12));
      ring.name = `revolver-bloom-${i}`; ring.position.set(99, 0, 17 - i * 2); this.group.add(ring); this.bloom.push(ring);
    }
    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + i % 3 * 3, 10, 7), additiveMaterial(weaponColor(ctx.color, -0.04, 0.1), 0.24));
      puff.name = `revolver-smoke-${i}`; this.group.add(puff); this.smoke.push({ mesh: puff, phase: i / 8, lane: i % 2 ? 1 : -1 });
    }
    for (let i = 0; i < 4; i++) {
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 17, 8), brass.clone());
      casing.name = `revolver-casing-${i}`; this.group.add(casing); this.casings.push({ mesh: casing, delay: i * 0.04, side: i % 2 ? 1 : -1 });
    }
  }

  update(t: number, _now: number): void {
    const muzzleEnergy = clamp(weaponParam(this.ctx.params, 'muzzleEnergy', 1), 0.45, 3.2);
    const recoilKick = clamp(weaponParam(this.ctx.params, 'recoilKick', 1), 0.35, 2.8);
    const smokeCurl = clamp(weaponParam(this.ctx.params, 'smokeCurl', 1), 0.2, 2.8);
    const casingSpin = clamp(weaponParam(this.ctx.params, 'casingSpin', 1), 0.2, 3.4);
    const tracerSpeed = clamp(weaponParam(this.ctx.params, 'tracerSpeed', 1), 0.6, 3.4);
    const flashCone = clamp(weaponParam(this.ctx.params, 'flashCone', 1), 0.45, 2.7);
    const launch = easeOut(t * (5.4 + muzzleEnergy));
    const recoil = Math.sin(clamp(t * 8, 0, 1) * Math.PI) * recoilKick;
    const fade = fadeAt(t, 0.58);
    this.revolver.position.set(-recoil * 18, recoil * 2.2, 0);
    this.revolver.rotation.z = -recoil * 0.048;
    this.muzzle.scale.set(flashCone * (0.35 + (1 - launch) * muzzleEnergy), 0.4 + (1 - launch) * muzzleEnergy, 1);
    setWeaponOpacity(this.revolver, fade);

    this.tracer.position.set(112 + launch * 340 * tracerSpeed, 0, 35);
    this.tracer.scale.set(0.65 + (1 - t) * muzzleEnergy * 0.45, 0.72, 1);
    setWeaponOpacity(this.tracer, fade * (1 - Math.min(1, t * 1.8)));
    for (let i = 0; i < this.bloom.length; i++) {
      const p = clamp((t - i * 0.025) * (5 + muzzleEnergy), 0, 1);
      const scale = 0.25 + p * (1.3 + muzzleEnergy * 0.45);
      this.bloom[i].scale.set(scale, scale * (0.68 + flashCone * 0.18), 1);
      this.bloom[i].rotation.z = p * TAU * (0.13 + i * 0.04);
      setWeaponOpacity(this.bloom[i], fade * (1 - p) * 0.7);
    }
    for (const puff of this.smoke) {
      const p = clamp((t - 0.035 - puff.phase * 0.16) * (1.55 + muzzleEnergy * 0.36), 0, 1);
      const curl = p * TAU * (0.38 + smokeCurl * 0.2) + puff.phase * TAU;
      puff.mesh.position.set(78 + p * (48 + smokeCurl * 20), puff.lane * (8 + p * 18) + Math.sin(curl) * 14 * smokeCurl, 27 + p * 22 + Math.cos(curl) * 6);
      puff.mesh.scale.setScalar((0.25 + p * (0.8 + smokeCurl * 0.2)) * (0.7 + muzzleEnergy * 0.14));
      setWeaponOpacity(puff.mesh, fade * Math.sin(p * Math.PI) * 0.32);
    }
    for (const casing of this.casings) {
      const p = clamp((t - 0.045 - casing.delay) * 2.35, 0, 1);
      const arc = Math.sin(p * Math.PI);
      casing.mesh.position.set(-4 + p * (26 + recoilKick * 16), casing.side * (13 + p * 26) + arc * 20, 34 + arc * 32 - p * p * 18);
      casing.mesh.rotation.set(p * TAU * casingSpin, p * TAU * casingSpin * 0.52, casing.side * p * TAU * casingSpin * 0.72);
      casing.mesh.scale.setScalar(0.28 + Math.sin(p * Math.PI) * 0.72);
      setWeaponOpacity(casing.mesh, fade * Math.sin(p * Math.PI));
    }
  }
}

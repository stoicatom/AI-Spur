import * as THREE from 'three';
import { geometry } from './three-effect-profiles';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, weaponParam } from './three-family-weapon-shared';

type MeleeMode = 'bow' | 'blade' | 'spear' | 'generic';

/** Existing melee presets keep their own silhouettes while firearm/fracture/shards use dedicated stages. */
export class MeleeWeaponStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly bases: THREE.Vector3[] = [];
  private readonly rotations: number[] = [];
  private readonly angle: number;
  private mode: MeleeMode = 'generic';

  constructor(private readonly ctx: FamilyContext) {
    this.angle = Math.atan2(ctx.direction.y, ctx.direction.x);
    ctx.root.add(this.group);
    this.createGeometry();
  }

  update(t: number, now: number): void {
    const travel = 1 - Math.pow(1 - Math.min(1, t * 1.45), 3);
    const dashLength = clamp(weaponParam(this.ctx.params, 'dashLength', 1), 0.6, 2.7);
    const fade = fadeAt(t, 0.7);
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i]; const base = this.bases[i];
      if (this.mode === 'bow') {
        const arrow = i === this.meshes.length - 1;
        const recoil = Math.sin(Math.min(1, t * 2.2) * Math.PI) * (this.ctx.params.twang ?? 1) * 8;
        const distance = travel * 190 * dashLength;
        mesh.position.set(base.x + this.ctx.direction.x * (arrow ? distance : -recoil), base.y + this.ctx.direction.y * (arrow ? distance : -recoil), base.z);
        mesh.rotation.z = this.rotations[i]; mesh.scale.setScalar(arrow ? 0.82 + travel * 0.28 : 0.75 + recoil * 0.025);
      } else if (this.mode === 'blade') {
        mesh.position.set(base.x + this.ctx.direction.x * travel * 94 * dashLength, base.y + this.ctx.direction.y * travel * 94 * dashLength, base.z);
        mesh.rotation.z = this.rotations[i] + t * (0.38 + (this.ctx.params.shear ?? 1) * 0.12);
        mesh.scale.setScalar(0.5 + Math.min(1, t * 3.2) * (1.35 + i * 0.1));
      } else if (this.mode === 'spear') {
        const thrust = clamp(weaponParam(this.ctx.params, 'thrust', 1), 0.8, 2.4);
        const speed = clamp(weaponParam(this.ctx.params, 'speed', 1), 0.6, 2.6);
        const lunge = 1 - Math.pow(1 - Math.min(1, t * (0.82 + speed * 0.5)), 3);
        const offset = i === 0 ? lunge * 145 * thrust - 42 : lunge * 145 * thrust + 44;
        mesh.position.set(this.ctx.origin.x + this.ctx.direction.x * offset, this.ctx.origin.y + this.ctx.direction.y * offset, base.z);
        mesh.rotation.z = this.rotations[i]; mesh.scale.setScalar(0.68 + travel * 0.5);
      } else {
        mesh.position.copy(base);
        mesh.rotation.z = now * 0.001 * (i ? -1 : 1) * this.ctx.profile.spin;
        mesh.scale.setScalar((0.45 + Math.min(1, t * 2.8) * 1.7) * (i ? 1.1 : 1));
      }
      setOpacity(mesh, fade * (i ? 0.68 : 0.92));
    }
  }

  private track(mesh: THREE.Mesh): void {
    this.group.add(mesh); this.meshes.push(mesh);
    this.bases.push(mesh.position.clone()); this.rotations.push(mesh.rotation.z);
  }

  private createGeometry(): void {
    const { color, origin, energy, params } = this.ctx;
    if (Number.isFinite(params.twang)) {
      this.mode = 'bow';
      for (const side of [-1, 1]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(58, 3, 8, 52, Math.PI * 1.18), additiveMaterial(color, 0.8));
        arc.name = `melee-bow-arc-${side}`;
        arc.position.set(origin.x - this.ctx.direction.y * side * 13, origin.y + this.ctx.direction.x * side * 13, 28 + side * 2);
        arc.rotation.z = this.angle + (side < 0 ? Math.PI * 0.42 : -Math.PI * 0.58); this.track(arc);
      }
      const arrow = new THREE.Mesh(new THREE.BoxGeometry(128 * (params.release ?? 1), 3.5, 3), additiveMaterial(color, 0.92));
      arrow.name = 'melee-bow-arrow';
      arrow.position.copy(origin); arrow.position.z = 37; arrow.rotation.z = this.angle; this.track(arrow); return;
    }
    if (Number.isFinite(params.afterimage) || Number.isFinite(params.shear)) {
      this.mode = 'blade'; const count = Math.max(2, Math.min(5, Math.round(1 + (params.afterimage ?? params.shear ?? 1))));
      for (let i = 0; i < count; i++) {
        const blade = new THREE.Mesh(new THREE.TorusGeometry(54 + i * 7, Math.max(1.5, 4 - i * 0.55), 8, 60, Math.PI * 1.22), additiveMaterial(color, 0.86 - i * 0.1));
        blade.name = `melee-blade-${i}`;
        blade.position.set(origin.x - this.ctx.direction.x * i * 13, origin.y - this.ctx.direction.y * i * 13, 31 - i * 3);
        blade.rotation.z = this.angle - Math.PI * 0.61; this.track(blade);
      }
      return;
    }
    if (Number.isFinite(params.pierce) || Number.isFinite(params.thrust)) {
      this.mode = 'spear'; const reach = clamp(weaponParam(params, 'thrust', 1), 0.8, 2.4);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(130 * reach, 5, 4), additiveMaterial(color, 0.84));
      shaft.name = 'melee-spear-shaft';
      shaft.position.copy(origin); shaft.position.z = 32; shaft.rotation.z = this.angle; this.track(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(13 * (params.pierce ?? 1), 42, 6), physicalMaterial(color, energy));
      head.name = 'melee-spear-head';
      head.position.copy(origin); head.position.z = 39; head.rotation.z = this.angle - Math.PI / 2; this.track(head); return;
    }
    const blade = new THREE.Mesh(new THREE.TorusGeometry(62, 4, 8, 60, Math.PI * 1.28), additiveMaterial(color, 0.84));
    blade.position.copy(origin); blade.position.z = 28; blade.rotation.z = this.angle - Math.PI * 0.64; this.track(blade);
    const core = new THREE.Mesh(geometry(this.ctx.profile.shape, 24 * energy), physicalMaterial(color, energy));
    core.position.copy(origin); core.position.z = 34; this.track(core);
  }
}

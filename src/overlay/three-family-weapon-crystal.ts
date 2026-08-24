import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, easeOut, TAU, weaponColor, weaponParam } from './three-family-weapon-shared';

type Facet = { mesh: THREE.Mesh; angle: number; radius: number; phase: number };

/** Gem crystal forms a faceted prism, then disperses spectral tetrahedral facets. */
export class CrystalShatterWeaponStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly core = new THREE.Group();
  private readonly coreParts: THREE.Mesh[] = [];
  private readonly facets: Facet[] = [];
  private readonly halos: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.name = 'crystal-shatter-stage'; this.group.position.copy(ctx.origin); ctx.root.add(this.group); this.group.add(this.core);
    const shards = clamp(weaponParam(ctx.params, 'shards', 1), 0.5, 3);
    for (let i = 0; i < 7; i++) {
      const prism = new THREE.Mesh(new THREE.ConeGeometry(12 + i % 3 * 4, 64 + i % 4 * 16, 5), physicalMaterial(weaponColor(ctx.color, i * 0.022 - 0.055, 0.1), ctx.energy, 'glass'));
      prism.name = `crystal-prism-${i}`; prism.position.set((i - 3) * 12, -8 + Math.abs(i - 3) * 4, 20 + i % 3 * 5); prism.rotation.z = (i - 3) * -0.11; this.core.add(prism); this.coreParts.push(prism);
    }
    const count = Math.round(10 + shards * 9);
    for (let i = 0; i < count; i++) {
      const facet = new THREE.Mesh(new THREE.TetrahedronGeometry(7 + i % 4 * 2.2, 0), physicalMaterial(weaponColor(ctx.color, (i % 5 - 2) * 0.035, 0.12), ctx.energy, 'glass'));
      facet.name = `crystal-facet-${i}`; this.group.add(facet); this.facets.push({ mesh: facet, angle: i / count * TAU + i % 3 * 0.08, radius: 45 + i % 7 * 12, phase: 0.7 + i % 5 * 0.13 });
    }
    for (let i = 0; i < 4; i++) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(28 + i * 14, 1.5, 7, 48), additiveMaterial(weaponColor(ctx.color, i * 0.04, 0.2), 0.52 - i * 0.09));
      halo.name = `crystal-spectrum-${i}`; halo.position.z = 11 - i; halo.rotation.x = i * 0.36; this.group.add(halo); this.halos.push(halo);
    }
  }

  update(t: number, _now: number): void {
    const shards = clamp(weaponParam(this.ctx.params, 'shards', 1), 0.5, 3);
    const speed = clamp(weaponParam(this.ctx.params, 'shardSpeed', 1), 0.35, 3);
    const sparkle = clamp(weaponParam(this.ctx.params, 'sparkle', 1), 0.25, 3);
    const charge = Math.sin(clamp(t * 2.4, 0, 1) * Math.PI / 2);
    const shatter = easeOut((t - 0.2) / Math.max(0.18, 0.7 / speed));
    const fade = fadeAt(t, 0.73);
    this.core.scale.set(0.55 + charge * 0.55 - shatter * 0.7, 0.45 + charge * 0.7 - shatter * 0.76, 0.55 + charge * 0.55 - shatter * 0.7);
    this.core.rotation.set(shatter * 0.25, shatter * 0.36, shatter * 0.18);
    for (const part of this.coreParts) setOpacity(part, fade * (1 - shatter));
    for (const facet of this.facets) {
      const p = clamp((shatter - (facet.phase - 0.7) * 0.09) * 1.16, 0, 1);
      const travel = easeOut(p) * facet.radius * speed * (0.75 + shards * 0.16);
      const spectral = Math.sin(p * Math.PI) * sparkle;
      facet.mesh.position.set(Math.cos(facet.angle) * travel, Math.sin(facet.angle) * travel + spectral * 18 - p * p * 45, 24 + spectral * 22);
      facet.mesh.rotation.set(p * TAU * sparkle * facet.phase, p * TAU * speed, facet.angle + p * TAU * sparkle);
      facet.mesh.scale.setScalar(Math.sin(p * Math.PI) * (0.55 + shards * 0.14)); setOpacity(facet.mesh, fade * Math.sin(p * Math.PI));
    }
    for (let i = 0; i < this.halos.length; i++) {
      const p = (t * (0.65 + sparkle * 0.24) + i * 0.19) % 1;
      this.halos[i].scale.setScalar(0.32 + p * (1.1 + sparkle * 0.28)); this.halos[i].rotation.z = p * TAU * (i % 2 ? -1 : 1);
      setOpacity(this.halos[i], fade * (1 - p) * sparkle * 0.34);
    }
  }
}

type IceSpike = { mesh: THREE.Mesh; angle: number; length: number; delay: number };

/** Ice grows as a six-fold frozen bloom before brittle spikes shear away through frost fog. */
export class IceBloomWeaponStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly snowflake = new THREE.Group();
  private readonly snowParts: THREE.Mesh[] = [];
  private readonly spikes: IceSpike[] = [];
  private readonly frost: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.name = 'ice-bloom-stage'; this.group.position.copy(ctx.origin); ctx.root.add(this.group); this.group.add(this.snowflake);
    const ice = physicalMaterial(weaponColor(ctx.color, -0.035, 0.19), ctx.energy, 'ice');
    for (let arm = 0; arm < 6; arm++) {
      const angle = arm / 6 * TAU;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(82, 5, 6), ice); beam.name = `ice-arm-${arm}`; beam.rotation.z = angle; beam.position.set(Math.cos(angle) * 35, Math.sin(angle) * 35, 22); this.snowflake.add(beam); this.snowParts.push(beam);
      for (const side of [-1, 1]) {
        const barb = new THREE.Mesh(new THREE.ConeGeometry(5, 28, 5), ice); barb.name = `ice-barb-${arm}-${side}`; barb.position.set(Math.cos(angle) * 58 - Math.sin(angle) * side * 11, Math.sin(angle) * 58 + Math.cos(angle) * side * 11, 25); barb.rotation.z = angle - Math.PI / 2 + side * 0.62; this.snowflake.add(barb); this.snowParts.push(barb);
      }
    }
    const shardCount = Math.round(10 + clamp(weaponParam(ctx.params, 'shards', 1), 0.5, 3) * 8);
    for (let i = 0; i < shardCount; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(5 + i % 3, 28 + i % 5 * 7, 5), physicalMaterial(weaponColor(ctx.color, -0.02 + i % 3 * 0.012, 0.18), ctx.energy, 'ice'));
      spike.name = `ice-spike-${i}`; this.group.add(spike); this.spikes.push({ mesh: spike, angle: i / shardCount * TAU + i % 4 * 0.045, length: 44 + i % 6 * 12, delay: i % 6 * 0.025 });
    }
    for (let i = 0; i < 5; i++) {
      const fog = new THREE.Mesh(new THREE.RingGeometry(22 + i * 13, 32 + i * 17, 48), additiveMaterial(weaponColor(ctx.color, -0.025, 0.2), 0.22));
      fog.name = `ice-frost-${i}`; fog.position.z = 8 - i; this.group.add(fog); this.frost.push(fog);
    }
  }

  update(t: number, _now: number): void {
    const shards = clamp(weaponParam(this.ctx.params, 'shards', 1), 0.5, 3);
    const speed = clamp(weaponParam(this.ctx.params, 'shardSpeed', 1), 0.35, 3);
    const chill = clamp(weaponParam(this.ctx.params, 'chill', 1), 0.25, 3.2);
    const freeze = easeOut(t * (2.8 + chill * 0.6)); const burst = easeOut((t - 0.27) / Math.max(0.2, 0.72 / speed)); const fade = fadeAt(t, 0.76);
    this.snowflake.scale.setScalar(0.15 + freeze * (0.72 + chill * 0.16) - burst * 0.24); this.snowflake.rotation.z = freeze * 0.18 - burst * 0.1;
    for (const part of this.snowParts) setOpacity(part, fade * (1 - burst * 0.7));
    for (const spike of this.spikes) {
      const p = clamp((burst - spike.delay) * 1.2, 0, 1); const distance = easeOut(p) * spike.length * speed * (0.78 + shards * 0.15);
      spike.mesh.position.set(Math.cos(spike.angle) * distance, Math.sin(spike.angle) * distance - p * p * 36, 23 + Math.sin(p * Math.PI) * 28 * chill);
      spike.mesh.rotation.set(spike.angle + p * TAU * speed * 0.6, p * TAU * 0.32, spike.angle - Math.PI / 2); spike.mesh.scale.set(0.5 + chill * 0.08, Math.sin(p * Math.PI) * (0.7 + shards * 0.14), 0.5);
      setOpacity(spike.mesh, fade * Math.sin(p * Math.PI));
    }
    for (let i = 0; i < this.frost.length; i++) {
      const p = clamp((t - i * 0.055) * (1.1 + chill * 0.32), 0, 1);
      this.frost[i].scale.set(0.2 + p * (1.3 + chill * 0.46), (0.2 + p * (1.3 + chill * 0.46)) * (0.72 + i * 0.035), 1);
      this.frost[i].rotation.z = (i % 2 ? -1 : 1) * p * 0.18 * chill; setOpacity(this.frost[i], fade * (1 - p) * chill * 0.22);
    }
  }
}

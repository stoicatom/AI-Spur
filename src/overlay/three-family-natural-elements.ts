import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor, TAU } from './three-family-natural-shared';

type Ember = { mesh: THREE.Mesh; x: number; phase: number; height: number };
type Drop = { mesh: THREE.Mesh; angle: number; speed: number; delay: number; radius: number };

/** Flame-rise is a volumetric lick field with embers and a heat lens. */
export class FlameNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly flames: THREE.Mesh[] = [];
  private readonly flameX: number[] = [];
  private readonly embers: Ember[] = [];
  private readonly heat: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    const turbulence = clamp(ctx.params.turbulence ?? 1, 0.5, 3);
    const count = Math.round(7 + turbulence * 2);
    for (let i = 0; i < count; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(9 + i % 3 * 3, 58 + i % 4 * 13, 10), additiveMaterial(shiftedColor(ctx.color, -0.02, i % 2 ? 0.02 : 0.12), 0.72));
      const x = ctx.origin.x + (i - (count - 1) / 2) * 16;
      flame.position.set(x, ctx.origin.y - 28 - i % 3 * 4, 16 + i % 4 * 3); flame.rotation.z = (i - count / 2) * 0.08;
      this.group.add(flame); this.flames.push(flame); this.flameX.push(x);
    }
    for (let i = 0; i < 16; i++) {
      const ember = new THREE.Mesh(new THREE.OctahedronGeometry(2.2 + i % 3 * 0.8, 0), additiveMaterial(shiftedColor(ctx.color, 0.04, 0.18), 0.75));
      this.group.add(ember); this.embers.push({ mesh: ember, x: ctx.origin.x + ((i * 37) % 70) - 35, phase: (i * 0.173) % 1, height: 90 + (i % 5) * 24 });
    }
    for (let i = 0; i < 3; i++) {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(54 + i * 20, 16, 10), additiveMaterial(shiftedColor(ctx.color, -0.03, 0.06), 0.1));
      lens.position.set(ctx.origin.x + (i - 1) * 28, ctx.origin.y - 36, 3); lens.scale.y = 0.52; this.group.add(lens); this.heat.push(lens);
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.66); const turbulence = clamp(this.ctx.params.turbulence ?? 1, 0.5, 3);
    const rise = clamp(this.ctx.params.riseSpeed ?? 1, 0.4, 2.8); const heat = clamp(this.ctx.params.heat ?? 1, 0.5, 2.8);
    const ignite = clamp(t * 7, 0, 1);
    for (let i = 0; i < this.flames.length; i++) {
      const flicker = Math.sin(now * 0.014 * heat + i * 1.71) + Math.sin(now * 0.022 * turbulence + i * 0.73) * 0.45;
      const envelope = 0.8 + Math.abs(flicker) * 0.22;
      const flame = this.flames[i]; flame.position.x = this.flameX[i] + flicker * 2.4 * turbulence;
      flame.position.y = this.ctx.origin.y - 28 - i % 3 * 4 - Math.abs(flicker) * 7 * rise;
      flame.rotation.z = (i - this.flames.length / 2) * 0.08 + flicker * 0.055;
      flame.scale.set(0.72 + ignite * 0.2, envelope * (0.45 + ignite * 0.82 * rise), 0.72); setOpacity(flame, fade * (0.52 + Math.abs(flicker) * 0.16));
    }
    for (const ember of this.embers) {
      const p = (t * (0.9 + rise * 0.42) + ember.phase) % 1;
      const sway = Math.sin(p * TAU * 2 + now * 0.0018) * (10 + turbulence * 6);
      ember.mesh.position.set(ember.x + sway, this.ctx.origin.y - 8 - p * ember.height, 22 + p * 18);
      ember.mesh.rotation.set(p * TAU, now * 0.004 + ember.phase * 8, p * TAU * 0.7);
      ember.mesh.scale.setScalar((0.4 + (1 - p) * 0.8) * (0.8 + Math.abs(Math.sin(now * 0.01 + ember.phase)) * 0.4)); setOpacity(ember.mesh, fade * (1 - p) * 0.9);
    }
    for (let i = 0; i < this.heat.length; i++) {
      this.heat[i].scale.x = 1 + Math.sin(now * 0.005 + i) * 0.12; this.heat[i].scale.y = 0.5 + Math.sin(now * 0.008 + i) * 0.08;
      setOpacity(this.heat[i], fade * (0.07 + heat * 0.025));
    }
  }
}

/** Water splash is a crown of ballistic drops, jets and a ground ripple. */
export class SplashNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly drops: Drop[] = [];
  private readonly jets: THREE.Mesh[] = [];
  private readonly ripples: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    const droplets = clamp(ctx.params.droplets ?? 1, 0.5, 3);
    const dropGeometry = new THREE.SphereGeometry(3.2, 10, 7);
    for (let i = 0; i < Math.round(16 * droplets); i++) {
      const drop = new THREE.Mesh(dropGeometry, physicalMaterial(shiftedColor(ctx.color, 0.01, 0.08), ctx.energy, 'water')); this.group.add(drop);
      this.drops.push({ mesh: drop, angle: -Math.PI * 0.88 + (i / Math.max(1, 16 * droplets - 1)) * Math.PI * 0.76, speed: 42 + i % 6 * 8, delay: (i % 5) * 0.035, radius: 0.75 + (i % 4) * 0.11 });
    }
    for (let i = 0; i < 9; i++) {
      const jet = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), additiveMaterial(shiftedColor(ctx.color, 0.02, 0.12), 0.7));
      this.group.add(jet); this.jets.push(jet);
    }
    for (let i = 0; i < 3; i++) {
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(18 + i * 15, 1.4, 8, 48), additiveMaterial(ctx.color, 0.52 - i * 0.1));
      ripple.name = `water-ripple-${i}`; ripple.position.set(ctx.origin.x, ctx.origin.y - 66, 8 - i * 2); ripple.scale.y = 0.28; this.group.add(ripple); this.ripples.push(ripple);
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.7); const height = clamp(this.ctx.params.splashHeight ?? 1, 0.5, 2.8);
    const rippleEnergy = clamp(this.ctx.params.ripple ?? 1, 0.4, 3);
    const gravity = 1.15 + (2 - Math.min(2, this.ctx.profile.energy)) * 0.15;
    for (const drop of this.drops) {
      const p = clamp((t - drop.delay) / (0.76 - drop.delay), 0, 1);
      const arc = Math.sin(p * Math.PI); const distance = drop.speed * p;
      drop.mesh.position.set(this.ctx.origin.x + Math.cos(drop.angle) * distance, this.ctx.origin.y - 12 + arc * 100 * height - p * 42 * gravity, 18 + p * 16);
      drop.mesh.rotation.set(now * 0.003 + drop.angle, now * 0.004, drop.angle); drop.mesh.scale.set(0.65, 0.65 + arc * 1.4, 0.65);
      setOpacity(drop.mesh, fade * (0.2 + arc * 0.8));
    }
    for (let i = 0; i < this.jets.length; i++) {
      const angle = -Math.PI * 0.94 + i / Math.max(1, this.jets.length - 1) * Math.PI * 0.88 + Math.sin(now * 0.004 + i) * 0.02;
      const p = clamp((t - 0.03 - i * 0.012) / 0.52, 0, 1); const length = (0.2 + Math.sin(p * Math.PI) * 1.1) * (28 + i % 4 * 7) * height;
      const x = this.ctx.origin.x + Math.cos(angle) * (12 + p * 28); const y = this.ctx.origin.y - 14 + Math.sin(angle) * (12 + p * 28);
      placeBeam(this.jets[i], x, y, 17, x + Math.cos(angle) * length * 0.35, y + Math.sin(angle) * length, 17, 0.7 + p * 0.25); setOpacity(this.jets[i], fade * (1 - p * 0.35) * 0.72);
    }
    for (let i = 0; i < this.ripples.length; i++) {
      const p = clamp((t * (0.72 + rippleEnergy * 0.28) - i * 0.08) / 0.9, 0, 1);
      const radius = 0.2 + p * (1.8 + rippleEnergy * 0.9);
      this.ripples[i].scale.set(radius, radius * (0.22 + rippleEnergy * 0.06), 1);
      setOpacity(this.ripples[i], fade * (1 - p) * Math.min(0.84, 0.42 + rippleEnergy * 0.2));
    }
  }
}

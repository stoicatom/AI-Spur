import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, placeCosmicBeam, setObjectOpacity, TAU } from './three-family-cosmic-shared';

/** Three climbing helix arms carry beads upward instead of expanding flat rings. */
export class SpiralCosmicStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly ribbons: THREE.Mesh[] = [];
  private readonly beads: THREE.Mesh[] = [];

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group);
    const turns = clamp(cosmicParam(ctx.params, ['turns', 'spirals'], 1), 0.5, 4);
    for (let arm = 0; arm < 3; arm++) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 72; i++) {
        const p = i / 72; const angle = p * TAU * turns * 2.2 + arm / 3 * TAU;
        const radius = 12 + p * 62; points.push(new THREE.Vector3(Math.cos(angle) * radius, -92 + p * 190, Math.sin(angle) * 16));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 1.8 + arm * 0.35, 6, false), additiveMaterial(ctx.color.clone().offsetHSL(arm * 0.025, 0, 0.12), 0.48));
      ribbon.position.set(ctx.origin.x, ctx.origin.y, 20); this.group.add(ribbon); this.ribbons.push(ribbon);
    }
    for (let i = 0; i < 18; i++) {
      const bead = new THREE.Mesh(new THREE.OctahedronGeometry(3.5 + i % 3, 0), physicalMaterial(ctx.color.clone().offsetHSL(i % 3 * 0.018, 0, 0.1), ctx.energy, 'metal'));
      this.group.add(bead); this.beads.push(bead);
    }
  }

  update(t: number, now: number): void {
    const turns = clamp(cosmicParam(this.ctx.params, ['turns', 'spirals'], 1), 0.5, 4);
    const lift = clamp(cosmicParam(this.ctx.params, ['rise', 'lift'], 1), 0.5, 2.5);
    const fade = fadeAt(t, 0.76); const reveal = 0.25 + easeOut(t * 2.5) * 0.75;
    for (let arm = 0; arm < this.ribbons.length; arm++) {
      this.ribbons[arm].rotation.y = now * 0.0014 * this.ctx.profile.spin + arm * 0.12;
      this.ribbons[arm].scale.set(reveal, reveal * lift, reveal); setOpacity(this.ribbons[arm], fade * (0.48 - arm * 0.07));
    }
    for (let i = 0; i < this.beads.length; i++) {
      const arm = i % 3; const p = (t * (0.72 + lift * 0.18) + i / this.beads.length) % 1;
      const angle = p * TAU * turns * 2.2 + arm / 3 * TAU + now * 0.0014 * this.ctx.profile.spin;
      const radius = (12 + p * 62) * reveal;
      this.beads[i].position.set(this.ctx.origin.x + Math.cos(angle) * radius, this.ctx.origin.y + (-92 + p * 190) * reveal * lift, 28 + Math.sin(angle) * 16 * reveal);
      this.beads[i].rotation.set(angle, p * TAU, -angle * 0.4); this.beads[i].scale.setScalar(0.55 + Math.sin(p * Math.PI) * 0.55);
      setOpacity(this.beads[i], fade * Math.sin(p * Math.PI));
    }
  }
}

/** A launch shell blooms into gravity-curved streaks and persistent tip embers. */
export class FireworksCosmicStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly shell = new THREE.Group();
  private readonly shellFlame: THREE.Mesh;
  private readonly streaks: THREE.Mesh[] = [];
  private readonly stars: THREE.Mesh[] = [];
  private readonly afterglow: THREE.Mesh;

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.shell);
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 25, 8), physicalMaterial(ctx.color, ctx.energy, 'metal'));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 8), physicalMaterial(ctx.color.clone().offsetHSL(0.03, 0, 0.16), ctx.energy, 'metal'));
    cap.position.y = 17; this.shell.add(casing, cap);
    this.shellFlame = new THREE.Mesh(new THREE.ConeGeometry(5, 1, 8), additiveMaterial(ctx.color, 0.85));
    this.shellFlame.rotation.z = Math.PI; this.shellFlame.position.y = -20; this.shell.add(this.shellFlame);
    const starCount = Math.max(12, Math.min(30, Math.round(10 + cosmicParam(ctx.params, ['starCount'], 1) * 5)));
    for (let i = 0; i < starCount; i++) {
      const streak = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 5), additiveMaterial(ctx.color.clone().offsetHSL((i % 5 - 2) * 0.035, 0, 0.12), 0.76));
      const star = new THREE.Mesh(new THREE.SphereGeometry(3.2 + i % 3, 8, 6), additiveMaterial(ctx.color.clone().offsetHSL((i % 5 - 2) * 0.035, 0, 0.2), 0.92));
      this.group.add(streak, star); this.streaks.push(streak); this.stars.push(star);
    }
    this.afterglow = new THREE.Mesh(new THREE.SphereGeometry(34 * ctx.energy, 20, 12), additiveMaterial(ctx.color, 0.28));
    this.group.add(this.afterglow);
  }

  update(t: number, now: number): void {
    const risePower = clamp(cosmicParam(this.ctx.params, ['shellRise'], 1), 0.5, 3);
    const radiusScale = clamp(cosmicParam(this.ctx.params, ['burstRadius'], 1), 0.6, 2.8);
    const trailColor = clamp(cosmicParam(this.ctx.params, ['colorTrails'], 1), 0.5, 3);
    const gravity = clamp(cosmicParam(this.ctx.params, ['gravityArc'], 1), 0.25, 2.5);
    const glow = clamp(cosmicParam(this.ctx.params, ['afterglow'], 1), 0.3, 3);
    const launchEnd = 0.38; const launch = easeOut(t / launchEnd);
    const bx = this.ctx.origin.x + this.ctx.direction.x * 38; const by = this.ctx.origin.y + 115 + risePower * 24;
    this.shell.position.set(this.ctx.origin.x + this.ctx.direction.x * launch * 38, this.ctx.origin.y + launch * (115 + risePower * 24), 42);
    this.shell.scale.setScalar(0.72 + launch * 0.2); setObjectOpacity(this.shell, t < launchEnd + 0.07 ? 1 : 0);
    this.shellFlame.scale.set(0.85, 20 + risePower * 8 + Math.sin(now * 0.025) * 4, 0.85);
    const burst = clamp((t - launchEnd) / (1 - launchEnd), 0, 1); const spread = easeOut(burst);
    this.afterglow.position.set(bx, by, 20); this.afterglow.scale.setScalar(0.18 + spread * glow * 0.9);
    setOpacity(this.afterglow, fadeAt(t, 0.66) * burst * 0.34);
    for (let i = 0; i < this.streaks.length; i++) {
      const angle = i / this.streaks.length * TAU + (i % 3 - 1) * 0.06; const reach = (68 + i % 5 * 13) * radiusScale * spread;
      const drop = burst * burst * (30 + i % 4 * 8) * gravity; const ex = bx + Math.cos(angle) * reach; const ey = by + Math.sin(angle) * reach - drop;
      const tail = 0.56 + 0.12 * Math.sin(now * 0.006 * trailColor + i);
      placeCosmicBeam(this.streaks[i], bx + (ex - bx) * tail, by + (ey - by) * tail, 25, ex, ey, 29 + i % 3, 2.1);
      this.stars[i].position.set(ex, ey, 31 + i % 3); this.stars[i].scale.setScalar(0.7 + Math.sin(now * 0.012 * trailColor + i) * 0.22);
      const opacity = fadeAt(t, 0.72) * burst * (1 - burst * 0.25);
      setOpacity(this.streaks[i], opacity * 0.72); setOpacity(this.stars[i], opacity);
    }
  }
}

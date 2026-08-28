import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, placeCosmicBeam, setObjectOpacity, TAU } from './three-family-cosmic-shared';

/** A hot rocky body descends into a fixed impact point, then throws a crater fan. */
export class MeteorImpactStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly meteor = new THREE.Group();
  private readonly tails: THREE.Mesh[] = [];
  private readonly craterRings: THREE.Mesh[] = [];
  private readonly debris: THREE.Mesh[] = [];

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.meteor);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(17 * ctx.energy, 1), physicalMaterial(ctx.color.clone().offsetHSL(-0.03, -0.35, -0.2), ctx.energy, 'rock'));
    const furnace = new THREE.Mesh(new THREE.IcosahedronGeometry(19 * ctx.energy, 1), new THREE.MeshBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.58, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.meteor.add(rock, furnace);
    for (let i = 0; i < 3; i++) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 10, 1, true), additiveMaterial(ctx.color.clone().offsetHSL(i * 0.025, 0, 0.14), 0.72 - i * 0.14));
      this.group.add(tail); this.tails.push(tail);
    }
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(22 + i * 7, 2.6 - i * 0.45, 8, 56), additiveMaterial(ctx.color, 0.65 - i * 0.12));
      this.group.add(ring); this.craterRings.push(ring);
    }
    const debrisCount = Math.max(10, Math.min(24, Math.round(11 + cosmicParam(ctx.params, ['debris'], 1) * 5)));
    for (let i = 0; i < debrisCount; i++) {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(3 + i % 4, 0), physicalMaterial(ctx.color.clone().offsetHSL(0, 0, -0.08), ctx.energy, 'rock'));
      this.group.add(shard); this.debris.push(shard);
    }
  }

  update(t: number, now: number): void {
    const trail = clamp(cosmicParam(this.ctx.params, ['trail'], 1), 0.55, 3);
    const force = clamp(cosmicParam(this.ctx.params, ['impact'], 1), 0.55, 2.8);
    const debrisScale = clamp(cosmicParam(this.ctx.params, ['debris'], 1), 0.5, 2.6);
    const flight = clamp(t / 0.58, 0, 1); const fall = flight * flight * (3 - 2 * flight);
    const sx = this.ctx.origin.x - this.ctx.direction.x * 125; const sy = this.ctx.origin.y + 145;
    const ex = this.ctx.origin.x + this.ctx.direction.x * 92; const ey = this.ctx.origin.y - 84;
    const x = sx + (ex - sx) * fall; const y = sy + (ey - sy) * fall;
    this.meteor.position.set(x, y, 44); this.meteor.rotation.set(now * 0.0014, now * 0.0019, -0.62 + this.ctx.direction.x * 0.2);
    this.meteor.scale.setScalar(0.82 + flight * 0.28); setObjectOpacity(this.meteor, t < 0.66 ? 1 : fadeAt(t, 0.58));
    const dx = ex - sx; const dy = ey - sy; const length = Math.hypot(dx, dy); const ux = dx / length; const uy = dy / length;
    for (let i = 0; i < this.tails.length; i++) {
      const tailLength = (72 + i * 35) * trail * (0.45 + flight * 0.55);
      const sway = Math.sin(now * 0.008 + i * 2.2) * (5 + i * 3);
      placeCosmicBeam(this.tails[i], x - ux * tailLength - uy * sway, y - uy * tailLength + ux * sway, 28 - i * 3, x - ux * 12, y - uy * 12, 39, 8 - i * 1.6);
      setOpacity(this.tails[i], (t < 0.6 ? 1 : fadeAt(t, 0.56)) * (0.74 - i * 0.13));
    }
    const impact = clamp((t - 0.54) / 0.46, 0, 1);
    for (let i = 0; i < this.craterRings.length; i++) {
      const delayed = clamp(impact * 1.45 - i * 0.16, 0, 1); const radius = 0.2 + delayed * (2.3 + force * 0.45);
      this.craterRings[i].position.set(ex, ey, 14 - i); this.craterRings[i].scale.set(radius, radius * 0.38, 1);
      setOpacity(this.craterRings[i], fadeAt(t, 0.72) * delayed * (1 - delayed * 0.72));
    }
    for (let i = 0; i < this.debris.length; i++) {
      const angle = i / this.debris.length * TAU + 0.17; const range = (48 + i % 6 * 12) * force;
      const arc = Math.sin(impact * Math.PI) * (38 + i % 5 * 10) * debrisScale;
      this.debris[i].position.set(ex + Math.cos(angle) * range * impact, ey + Math.sin(angle) * range * impact * 0.34 + arc, 18 + i % 4 * 3);
      this.debris[i].rotation.set(impact * (2 + i % 4), impact * (3 + i % 3), angle);
      this.debris[i].scale.setScalar(impact * (1 - impact * 0.45)); setOpacity(this.debris[i], fadeAt(t, 0.78) * impact);
    }
  }
}

/** A cool comet keeps gliding beyond a mid-path flare instead of striking ground. */
export class CometFlybyStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly nucleus = new THREE.Group();
  private readonly tailSegments: THREE.Mesh[] = [];
  private readonly burstRays: THREE.Mesh[] = [];
  private readonly pointA = new THREE.Vector2();
  private readonly pointB = new THREE.Vector2();

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.nucleus);
    const ice = new THREE.Mesh(new THREE.DodecahedronGeometry(15 * ctx.energy, 0), physicalMaterial(ctx.color.clone().offsetHSL(0.02, -0.08, 0.2), ctx.energy, 'ice'));
    const coma = new THREE.Mesh(new THREE.SphereGeometry(25 * ctx.energy, 18, 12), additiveMaterial(ctx.color, 0.32));
    this.nucleus.add(ice, coma);
    for (let i = 0; i < 9; i++) {
      const segment = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8, 1, true), additiveMaterial(ctx.color.clone().offsetHSL(i * 0.008, 0, 0.12), 0.68 - i * 0.045));
      this.group.add(segment); this.tailSegments.push(segment);
    }
    for (let i = 0; i < 16; i++) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 5), additiveMaterial(ctx.color.clone().offsetHSL((i % 3 - 1) * 0.025, 0, 0.14), 0.72));
      this.group.add(ray); this.burstRays.push(ray);
    }
  }

  private path(p: number, target: THREE.Vector2, glide: number): THREE.Vector2 {
    const q = clamp(p, 0, 1); const nx = -this.ctx.direction.y; const ny = this.ctx.direction.x;
    const along = -145 + q * 330 * glide; const arc = Math.sin(q * Math.PI) * 52;
    return target.set(this.ctx.origin.x + this.ctx.direction.x * along + nx * arc, this.ctx.origin.y + this.ctx.direction.y * along + ny * arc,);
  }

  update(t: number, now: number): void {
    const trail = clamp(cosmicParam(this.ctx.params, ['trailLength'], 1), 0.6, 3);
    const spread = clamp(cosmicParam(this.ctx.params, ['burstSpread'], 1), 0.5, 2.8);
    const glide = clamp(cosmicParam(this.ctx.params, ['glide'], 1), 0.55, 2.2);
    const travel = easeOut(t); const current = this.path(travel, this.pointA, glide);
    this.nucleus.position.set(current.x, current.y, 42); this.nucleus.rotation.set(now * 0.001, now * 0.0018, t * 1.5);
    this.nucleus.scale.setScalar(0.72 + Math.sin(now * 0.009) * 0.05 + Math.min(1, t * 5) * 0.28);
    setObjectOpacity(this.nucleus, fadeAt(t, 0.83));
    for (let i = 0; i < this.tailSegments.length; i++) {
      const gap = (0.018 + i * 0.008) * trail; const a = this.path(travel - gap, this.pointA, glide); const b = this.path(travel - gap - 0.055 * trail, this.pointB, glide);
      placeCosmicBeam(this.tailSegments[i], b.x, b.y, 24 - i * 0.7, a.x, a.y, 37 - i * 0.4, 8 - i * 0.58);
      setOpacity(this.tailSegments[i], fadeAt(t, 0.8) * (0.7 - i * 0.05));
    }
    const burst = clamp((t - 0.46) / 0.36, 0, 1); const center = this.path(0.58, this.pointA, glide);
    for (let i = 0; i < this.burstRays.length; i++) {
      const angle = i / this.burstRays.length * TAU + this.ctx.profile.spin * 0.08;
      const radius = burst * (48 + i % 4 * 15) * spread; const ex = center.x + Math.cos(angle) * radius; const ey = center.y + Math.sin(angle) * radius;
      placeCosmicBeam(this.burstRays[i], center.x + Math.cos(angle) * radius * 0.42, center.y + Math.sin(angle) * radius * 0.42, 24, ex, ey, 28 + i % 3, 2.4);
      setOpacity(this.burstRays[i], fadeAt(t, 0.72) * burst * (1 - burst * 0.48));
    }
  }
}

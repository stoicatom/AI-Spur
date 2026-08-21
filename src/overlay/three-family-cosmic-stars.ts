import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, placeCosmicBeam, setObjectOpacity, starGeometry, TAU } from './three-family-cosmic-shared';

/** A literal multi-point star drives aligned rays and faceted point sparks. */
export class StarBurstStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly star: THREE.Mesh;
  private readonly haloStar: THREE.Mesh;
  private readonly rays: THREE.Mesh[] = [];
  private readonly tips: THREE.Mesh[] = [];
  private readonly pointCount: number;

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group);
    this.pointCount = Math.max(5, Math.min(12, Math.round(cosmicParam(ctx.params, ['points'], 1) * 5)));
    this.star = new THREE.Mesh(starGeometry(this.pointCount, 30 * ctx.energy, 12 * ctx.energy), physicalMaterial(ctx.color.clone().offsetHSL(0, 0, 0.18), ctx.energy, 'fire'));
    this.haloStar = new THREE.Mesh(starGeometry(this.pointCount, 39 * ctx.energy, 16 * ctx.energy), new THREE.MeshBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.4, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.star, this.haloStar);
    for (let i = 0; i < this.pointCount * 2; i++) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 5), additiveMaterial(ctx.color, 0.7));
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(4 + i % 3, 0), additiveMaterial(ctx.color.clone().offsetHSL((i % 3 - 1) * 0.025, 0, 0.16), 0.82));
      this.group.add(ray, tip); this.rays.push(ray); this.tips.push(tip);
    }
  }

  update(t: number, now: number): void {
    const sparkle = clamp(cosmicParam(this.ctx.params, ['sparkle'], 1), 0.4, 3);
    const twinkle = clamp(cosmicParam(this.ctx.params, ['twinkle'], 1), 0.35, 3);
    const burst = easeOut(t * 1.7); const fade = fadeAt(t, 0.7); const pulse = 0.9 + Math.sin(now * 0.012 * twinkle) * 0.1;
    for (const star of [this.star, this.haloStar]) {
      star.position.set(this.ctx.origin.x, this.ctx.origin.y + t * 24, star === this.star ? 36 : 30);
      star.rotation.z = now * 0.0005 * this.ctx.profile.spin; star.scale.setScalar((0.24 + burst * 0.76) * pulse);
      setOpacity(star, fade * (star === this.star ? 1 : 0.45));
    }
    for (let i = 0; i < this.rays.length; i++) {
      const angle = i / this.rays.length * TAU - Math.PI / 2; const stagger = clamp(burst * 1.35 - (i % 3) * 0.08, 0, 1);
      const distance = stagger * (58 + i % 4 * 15) * sparkle; const sx = this.ctx.origin.x + Math.cos(angle) * 25; const sy = this.ctx.origin.y + t * 24 + Math.sin(angle) * 25;
      const ex = this.ctx.origin.x + Math.cos(angle) * distance; const ey = this.ctx.origin.y + t * 24 + Math.sin(angle) * distance;
      placeCosmicBeam(this.rays[i], sx, sy, 24, ex, ey, 27 + i % 3, 1.8 + i % 2 * 0.6);
      this.tips[i].position.set(ex, ey, 31 + i % 3); this.tips[i].rotation.set(now * 0.001 + i, now * 0.0014 + i * 0.3, angle);
      this.tips[i].scale.setScalar(0.45 + Math.abs(Math.sin(now * 0.01 * twinkle + i)) * 0.55);
      setOpacity(this.rays[i], fade * stagger * 0.65); setOpacity(this.tips[i], fade * stagger);
    }
  }
}

/** Independent cross-shaped glints blink across a sparse constellation field. */
export class TwinkleFieldStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly glints: THREE.Group[] = [];
  private readonly anchors: THREE.Vector3[] = [];
  private readonly constellation: THREE.LineSegments;

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group);
    const count = Math.max(7, Math.min(24, Math.round(cosmicParam(ctx.params, ['stars'], 1) * 11)));
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963; const radius = 20 + Math.sqrt((i + 1) / count) * 105;
      const anchor = new THREE.Vector3(ctx.origin.x + Math.cos(angle) * radius, ctx.origin.y + Math.sin(angle) * radius * 0.7, 18 + i % 5);
      const glint = new THREE.Group(); const material = additiveMaterial(ctx.color.clone().offsetHSL((i % 4 - 1.5) * 0.018, 0, 0.16), 0.8);
      const vertical = new THREE.Mesh(new THREE.ConeGeometry(2.2, 24 + i % 3 * 7, 4), material);
      const horizontal = new THREE.Mesh(new THREE.ConeGeometry(2.2, 18 + i % 4 * 5, 4), material); horizontal.rotation.z = Math.PI / 2;
      const center = new THREE.Mesh(new THREE.OctahedronGeometry(3.5, 0), physicalMaterial(ctx.color, ctx.energy, 'fire'));
      glint.add(vertical, horizontal, center); glint.position.copy(anchor); this.group.add(glint); this.glints.push(glint); this.anchors.push(anchor);
    }
    const linePoints: THREE.Vector3[] = [];
    for (let i = 1; i < this.anchors.length; i += 2) linePoints.push(this.anchors[i - 1], this.anchors[i]);
    this.constellation = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.constellation);
  }

  update(t: number, now: number): void {
    const blinks = clamp(cosmicParam(this.ctx.params, ['blinks', 'twinkle'], 1), 0.35, 3.2);
    const density = clamp(cosmicParam(this.ctx.params, ['sparkle'], 1), 0.5, 2.4); const fade = fadeAt(t, 0.76);
    for (let i = 0; i < this.glints.length; i++) {
      const blink = Math.pow(Math.abs(Math.sin(now * 0.0035 * blinks + i * 1.73)), 5);
      const anchor = this.anchors[i]; const drift = Math.sin(now * 0.0015 + i) * 5;
      this.glints[i].position.set(anchor.x + drift, anchor.y + t * 24 + Math.cos(now * 0.001 + i) * 3, anchor.z);
      this.glints[i].rotation.z = i * 0.21 + Math.sin(now * 0.0018 + i) * 0.18;
      this.glints[i].scale.setScalar((0.35 + blink * 0.95) * density); setObjectOpacity(this.glints[i], fade * (0.16 + blink * 0.84));
    }
    this.constellation.position.y = t * 24; setOpacity(this.constellation, fade * 0.17 * Math.min(1, t * 4));
  }
}

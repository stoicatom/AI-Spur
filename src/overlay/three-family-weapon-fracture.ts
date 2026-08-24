import * as THREE from 'three';
import { additiveLineMaterial, additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, easeOut, TAU, weaponColor, weaponParam } from './three-family-weapon-shared';

type GlassShard = { mesh: THREE.Mesh; angle: number; radius: number; delay: number; lift: number };

/** Laminated glass fails in stages: impact lens, branching cracks, then refractive shards. */
export class GlassFractureWeaponStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly lens: THREE.Mesh;
  private readonly chroma: THREE.Mesh[] = [];
  private readonly crack: THREE.LineSegments;
  private readonly shards: GlassShard[] = [];
  private readonly shock: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.name = 'glass-fracture-stage'; this.group.position.copy(ctx.origin); ctx.root.add(this.group);
    const impactRadius = clamp(weaponParam(ctx.params, 'impactRadius', 1), 0.45, 2.8);
    const refraction = clamp(weaponParam(ctx.params, 'refraction', 1), 0.25, 3);
    this.lens = new THREE.Mesh(
      new THREE.CircleGeometry(29 * impactRadius, 48),
      additiveMaterial(weaponColor(ctx.color, 0.02, 0.2), 0.36),
    );
    this.lens.name = 'glass-impact-lens'; this.lens.position.z = 18; this.group.add(this.lens);
    for (const side of [-1, 1]) {
      const ghost = new THREE.Mesh(
        new THREE.RingGeometry(24 * impactRadius, (27 + refraction * 3) * impactRadius, 52),
        additiveMaterial(weaponColor(ctx.color, side * 0.085, 0.16), 0.3),
      );
      ghost.name = `glass-refraction-${side}`; ghost.position.z = 16 + side; this.group.add(ghost); this.chroma.push(ghost);
    }
    this.crack = this.createCrackGraph(impactRadius);
    const branches = Math.round(clamp(weaponParam(ctx.params, 'crackBranches', 10), 7, 18));
    const shardCount = Math.min(30, branches * 2 + 4);
    for (let i = 0; i < shardCount; i++) {
      const shape = new THREE.Shape();
      const width = 5 + i % 4 * 2; const height = 13 + i % 5 * 4;
      shape.moveTo(-width, -height * 0.32); shape.lineTo(width * 0.7, -height * 0.5); shape.lineTo(width * 0.25, height); shape.closePath();
      const material = physicalMaterial(weaponColor(ctx.color, (i % 3 - 1) * 0.035, 0.12), ctx.energy, 'glass');
      material.metalness = 0.05; material.roughness = 0.08; material.transmission = 0.48;
      const shard = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
      shard.name = `glass-shard-${i}`; this.group.add(shard);
      this.shards.push({ mesh: shard, angle: i / shardCount * TAU + (i % 4) * 0.07, radius: 17 + i % 6 * 8, delay: i % 5 * 0.018, lift: 0.65 + i % 4 * 0.16 });
    }
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(24 + i * 15, 1.7, 8, 52), additiveMaterial(ctx.color, 0.56 - i * 0.12));
      ring.name = `glass-shock-${i}`; ring.position.z = 12 - i; this.group.add(ring); this.shock.push(ring);
    }
  }

  update(t: number, _now: number): void {
    const impactRadius = clamp(weaponParam(this.ctx.params, 'impactRadius', 1), 0.45, 2.8);
    const velocity = clamp(weaponParam(this.ctx.params, 'shardVelocity', 1), 0.35, 3.2);
    const spin = clamp(weaponParam(this.ctx.params, 'shardSpin', 1), 0.2, 3.6);
    const refraction = clamp(weaponParam(this.ctx.params, 'refraction', 1), 0.25, 3);
    const fractureDelay = clamp(weaponParam(this.ctx.params, 'fractureDelay', 0.08), 0, 0.42);
    const contact = easeOut(t * 8);
    const fracture = clamp((t - fractureDelay) / Math.max(0.18, 0.68 - fractureDelay), 0, 1);
    const fade = fadeAt(t, 0.72);
    this.lens.scale.setScalar(0.16 + contact * (0.84 + impactRadius * 0.12));
    this.lens.rotation.z = contact * 0.08 * refraction; setOpacity(this.lens, fade * (1 - fracture * 0.45) * 0.38);
    this.crack.scale.setScalar(0.12 + easeOut(fracture * 2.4) * (0.88 + impactRadius * 0.1));
    setOpacity(this.crack, fade * easeOut(fracture * 3.2) * 0.9);
    for (let i = 0; i < this.chroma.length; i++) {
      const ghost = this.chroma[i]; const side = i ? 1 : -1;
      ghost.position.set(side * fracture * refraction * 9, -side * fracture * refraction * 4, 16 + side);
      ghost.scale.setScalar(0.22 + contact * (0.8 + refraction * 0.12)); ghost.rotation.z = side * fracture * 0.16;
      setOpacity(ghost, fade * (1 - fracture * 0.52) * refraction * 0.2);
    }
    for (const shard of this.shards) {
      const p = clamp((fracture - shard.delay) / Math.max(0.2, 0.9 - shard.delay), 0, 1);
      const travel = easeOut(p) * shard.radius * velocity * impactRadius;
      const gravity = p * p * 72 / shard.lift;
      shard.mesh.position.set(Math.cos(shard.angle) * travel, Math.sin(shard.angle) * travel - gravity, 22 + Math.sin(p * Math.PI) * 42 * shard.lift);
      shard.mesh.rotation.set(p * TAU * spin * shard.lift, p * TAU * spin * 0.43, shard.angle + p * TAU * spin);
      const scale = Math.sin(p * Math.PI) * (0.5 + refraction * 0.18);
      shard.mesh.scale.set(scale, scale * (0.8 + refraction * 0.1), scale);
      setOpacity(shard.mesh, fade * Math.sin(p * Math.PI) * (0.6 + refraction * 0.12));
    }
    for (let i = 0; i < this.shock.length; i++) {
      const p = clamp((t - i * 0.045) * (2.4 + impactRadius * 0.4), 0, 1);
      this.shock[i].scale.setScalar(0.2 + p * (2 + impactRadius * 0.75));
      setOpacity(this.shock[i], fade * (1 - p) * 0.58);
    }
  }

  private createCrackGraph(radius: number): THREE.LineSegments {
    const rays = Math.round(clamp(weaponParam(this.ctx.params, 'crackBranches', 10), 7, 18));
    const data = new Float32Array(rays * 3 * 6); let cursor = 0;
    for (let ray = 0; ray < rays; ray++) {
      const angle = ray / rays * TAU + (ray % 3 - 1) * 0.035;
      for (let segment = 0; segment < 3; segment++) {
        const start = (8 + segment * (24 + ray % 3 * 4)) * radius;
        const end = start + (24 + (ray + segment) % 4 * 8) * radius;
        const fork = (segment % 2 ? -1 : 1) * (0.035 + ray % 4 * 0.012);
        data[cursor++] = Math.cos(angle + fork) * start; data[cursor++] = Math.sin(angle + fork) * start; data[cursor++] = segment * 1.5;
        data[cursor++] = Math.cos(angle - fork) * end; data[cursor++] = Math.sin(angle - fork) * end; data[cursor++] = segment * 2;
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
    const line = new THREE.LineSegments(geometry, additiveLineMaterial(weaponColor(this.ctx.color, 0.02, 0.22), 0.9));
    line.name = 'glass-crack-graph'; line.position.z = 28; this.group.add(line); return line;
  }
}

import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor } from './three-family-natural-shared';
import { electricGlideAt } from './electric-glide';

type BoltLink = { mesh: THREE.Mesh; index: number; branch: number; step: number; side: number; start: number };

/** A staged, branching lightning rig with a bright impact lens. */
export class ElectricNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly links: BoltLink[] = [];
  private readonly nodes: THREE.Mesh[] = [];
  private readonly halo: THREE.Mesh;
  private readonly impact: THREE.Mesh;
  private readonly branchCount: number;
  private readonly jaggedness: number;
  private readonly flicker: number;
  private readonly boltLength: number;
  private readonly impulse: number;
  private readonly stiffness: number;
  private readonly drag: number;
  private readonly nominalSpeed: number;
  private slideOffset = 0;
  private slideVelocity = 0;

  constructor(private readonly ctx: FamilyContext) {
    const impulse = clamp(ctx.physics?.impulse ?? 1.45, 0.32, 4.8);
    const stiffness = clamp(ctx.physics?.stiffness ?? 1, 0.1, 4);
    this.boltLength = Math.max(ctx.width, ctx.height) * (0.62 + Math.min(0.16, ctx.energy * 0.03));
    this.impulse = impulse;
    this.stiffness = stiffness;
    this.drag = clamp(ctx.physics?.drag ?? ctx.profile.drag, 0.95, 0.999);
    const nominalGlide = electricGlideAt(0, ctx.profile.duration, ctx.width, ctx.height, impulse, stiffness, this.drag);
    this.nominalSpeed = nominalGlide.travelDistance / nominalGlide.flightSeconds;
    ctx.root.add(this.group);
    this.group.name = 'electric-glide-field';
    this.branchCount = Math.round(clamp(ctx.params.branches ?? 3, 2, 7));
    this.jaggedness = clamp(ctx.params.jaggedness ?? 1.25, 0.6, 2.8);
    this.flicker = clamp(ctx.params.flicker ?? 1.2, 0.5, 3);
    const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
    for (let i = 0; i < 16; i++) this.addLink(beamGeometry, i, -1, 0, 0, 0);
    for (let branch = 0; branch < this.branchCount; branch++) {
      const start = 0.2 + branch * 0.58 / Math.max(1, this.branchCount - 1);
      const side = branch % 2 ? -1 : 1;
      for (let step = 0; step < 4; step++) this.addLink(beamGeometry, 0, branch, step, side, start);
      const node = new THREE.Mesh(new THREE.OctahedronGeometry(5.5 + ctx.energy * 1.2, 0), physicalMaterial(ctx.color, ctx.energy, 'metal'));
      node.name = `electric-core-node-${branch}`;
      this.group.add(node); this.nodes.push(node);
    }
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(32, 3.4, 8, 48), additiveMaterial(shiftedColor(ctx.color, 0.04, 0.18), 0.8));
    this.halo.name = 'electric-impact-halo'; this.group.add(this.halo);
    this.impact = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 10), additiveMaterial(shiftedColor(ctx.color, 0, 0.25), 0.9));
    this.impact.name = 'electric-impact'; this.group.add(this.impact);
    this.updateSlide(0);
    this.updateStrikePoint(0, 0);
  }

  update(t: number, now: number): void {
    this.updateSlide(t);
    const reveal = clamp(t / 0.2, 0, 1);
    const fade = fadeAt(t, 0.54);
    const strobe = 0.5 + Math.abs(Math.sin(now * 0.035 * this.flicker)) * 0.5;
    const velocityRatio = clamp(this.slideVelocity / Math.max(1, this.nominalSpeed), 0.55, 1.8);
    for (const link of this.links) {
      if (link.branch < 0) this.updateMain(link, now);
      else this.updateBranch(link, now);
      const threshold = link.branch < 0 ? (link.index + 1) / 16 : link.start + link.step * 0.04;
      const visible = reveal >= threshold ? 1 : 0;
      setOpacity(link.mesh, visible * fade * strobe * (link.branch < 0 ? 0.96 : 0.66));
    }
    for (let i = 0; i < this.nodes.length; i++) {
      const start = 0.2 + i * 0.58 / Math.max(1, this.branchCount - 1);
      const x = this.mainX(start, now); const y = this.mainY(start, now);
      this.nodes[i].position.set(x, y, 34 + i % 3 * 2);
      this.nodes[i].rotation.set(now * 0.004, now * 0.006 + i, now * 0.003);
      const corePulse = 1 + Math.min(0.32, velocityRatio * 0.24);
      this.nodes[i].scale.setScalar(reveal >= start ? (1.48 + this.ctx.energy * 0.2 + strobe * 0.34) * corePulse : 0.001);
      setOpacity(this.nodes[i], fade * strobe);
    }
    this.updateStrikePoint(t, now);
    const shock = clamp((t - 0.12) / 0.58, 0, 1);
    this.halo.scale.setScalar((0.64 + shock * 5.8 + this.ctx.energy * 0.14) * (0.88 + velocityRatio * 0.12));
    this.halo.rotation.set(0.25 + Math.sin(now * 0.004) * 0.2, 0.4, now * 0.002);
    this.impact.scale.setScalar((1 - shock * 0.58) * (1.02 + strobe * 0.42 + this.ctx.energy * 0.08) * (0.9 + velocityRatio * 0.1));
    setOpacity(this.halo, fade * (1 - shock) * 0.8); setOpacity(this.impact, fade * strobe);
  }

  private addLink(geometry: THREE.BufferGeometry, index: number, branch: number, step: number, side: number, start: number): void {
    const mesh = new THREE.Mesh(geometry, additiveMaterial(this.ctx.color, branch < 0 ? 0.95 : 0.66));
    mesh.name = branch < 0 ? `electric-main-bolt-${index}` : `electric-branch-${branch}-${step}`;
    this.group.add(mesh); this.links.push({ mesh, index, branch, step, side, start });
  }

  /** Integrates a charged leader with fixed-step exponential air drag. */
  private updateSlide(t: number): void {
    const glide = electricGlideAt(t, this.ctx.profile.duration, this.ctx.width, this.ctx.height, this.impulse, this.stiffness, this.drag);
    this.slideOffset = glide.offset;
    this.slideVelocity = glide.velocity;
  }

  private updateStrikePoint(t: number, now: number): void {
    const endX = this.mainX(1, now); const endY = this.mainY(1, now);
    this.halo.position.set(endX, endY, 28);
    this.impact.position.set(endX, endY, 24);
    this.halo.userData.slideVelocity = this.slideVelocity;
    this.impact.userData.slideProgress = clamp(t, 0, 1);
  }

  private mainX(u: number, now: number): number {
    const perpendicular = -this.ctx.direction.y;
    const jag = Math.sin(u * 48 + Math.floor(now * 0.018 * this.flicker) * 1.7) * this.jaggedness * 10 * Math.sin(u * Math.PI);
    return this.ctx.origin.x + this.ctx.direction.x * (this.slideOffset + u * this.boltLength) + perpendicular * jag;
  }

  private mainY(u: number, now: number): number {
    const perpendicular = this.ctx.direction.x;
    const jag = Math.sin(u * 48 + Math.floor(now * 0.018 * this.flicker) * 1.7) * this.jaggedness * 10 * Math.sin(u * Math.PI);
    return this.ctx.origin.y + this.ctx.direction.y * (this.slideOffset + u * this.boltLength) + perpendicular * jag;
  }

  private updateMain(link: BoltLink, now: number): void {
    const u0 = link.index / 16; const u1 = (link.index + 1) / 16;
    const velocityRatio = clamp(this.slideVelocity / Math.max(1, this.nominalSpeed), 0.55, 1.8);
    placeBeam(link.mesh, this.mainX(u0, now), this.mainY(u0, now), 32, this.mainX(u1, now), this.mainY(u1, now), 32, (1.5 + this.ctx.energy * 0.38) * velocityRatio);
  }

  private updateBranch(link: BoltLink, now: number): void {
    const v0 = link.step / 4; const v1 = (link.step + 1) / 4;
    const baseX = this.mainX(link.start, now); const baseY = this.mainY(link.start, now);
    const reach = 38 + link.branch % 3 * 12;
    const px = -this.ctx.direction.y * link.side; const py = this.ctx.direction.x * link.side;
    const x0 = baseX + this.ctx.direction.x * v0 * reach + px * v0 * reach * 0.82 + Math.sin(link.step * 4.1) * 4;
    const y0 = baseY + this.ctx.direction.y * v0 * reach + py * v0 * reach * 0.82 + Math.cos(link.step * 3.7) * 4;
    const x1 = baseX + this.ctx.direction.x * v1 * reach + px * v1 * reach * 0.82 + Math.sin((link.step + 1) * 4.1) * 4;
    const y1 = baseY + this.ctx.direction.y * v1 * reach + py * v1 * reach * 0.82 + Math.cos((link.step + 1) * 3.7) * 4;
    placeBeam(link.mesh, x0, y0, 30, x1, y1, 30, 0.82 + this.ctx.energy * 0.2);
  }
}

import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor } from './three-family-natural-shared';

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

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    this.branchCount = Math.round(clamp(ctx.params.branches ?? 3, 2, 7));
    this.jaggedness = clamp(ctx.params.jaggedness ?? 1.25, 0.6, 2.8);
    this.flicker = clamp(ctx.params.flicker ?? 1.2, 0.5, 3);
    const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
    for (let i = 0; i < 16; i++) this.addLink(beamGeometry, i, -1, 0, 0, 0);
    for (let branch = 0; branch < this.branchCount; branch++) {
      const start = 0.2 + branch * 0.58 / Math.max(1, this.branchCount - 1);
      const side = branch % 2 ? -1 : 1;
      for (let step = 0; step < 4; step++) this.addLink(beamGeometry, 0, branch, step, side, start);
      const node = new THREE.Mesh(new THREE.OctahedronGeometry(4 + ctx.energy, 0), physicalMaterial(ctx.color, ctx.energy, 'metal'));
      this.group.add(node); this.nodes.push(node);
    }
    const endX = ctx.origin.x + ctx.direction.x * 92;
    const endY = ctx.origin.y + ctx.direction.y * 92;
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(25, 2.8, 8, 48), additiveMaterial(shiftedColor(ctx.color, 0.04, 0.18), 0.8));
    this.halo.position.set(endX, endY, 28); this.group.add(this.halo);
    this.impact = new THREE.Mesh(new THREE.SphereGeometry(15, 16, 10), additiveMaterial(shiftedColor(ctx.color, 0, 0.25), 0.9));
    this.impact.position.set(endX, endY, 24); this.group.add(this.impact);
  }

  update(t: number, now: number): void {
    const reveal = clamp(t / 0.2, 0, 1);
    const fade = fadeAt(t, 0.54);
    const strobe = 0.5 + Math.abs(Math.sin(now * 0.035 * this.flicker)) * 0.5;
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
      this.nodes[i].scale.setScalar(reveal >= start ? 0.7 + strobe * 0.45 : 0.001);
      setOpacity(this.nodes[i], fade * strobe);
    }
    const shock = clamp((t - 0.12) / 0.58, 0, 1);
    this.halo.scale.setScalar(0.2 + shock * 3.8);
    this.halo.rotation.set(0.25 + Math.sin(now * 0.004) * 0.2, 0.4, now * 0.002);
    this.impact.scale.setScalar((1 - shock * 0.72) * (0.8 + strobe * 0.35));
    setOpacity(this.halo, fade * (1 - shock) * 0.8); setOpacity(this.impact, fade * strobe);
  }

  private addLink(geometry: THREE.BufferGeometry, index: number, branch: number, step: number, side: number, start: number): void {
    const mesh = new THREE.Mesh(geometry, additiveMaterial(this.ctx.color, branch < 0 ? 0.95 : 0.66));
    this.group.add(mesh); this.links.push({ mesh, index, branch, step, side, start });
  }

  private mainX(u: number, now: number): number {
    const perpendicular = -this.ctx.direction.y;
    const jag = Math.sin(u * 48 + Math.floor(now * 0.018 * this.flicker) * 1.7) * this.jaggedness * 10 * Math.sin(u * Math.PI);
    return this.ctx.origin.x + this.ctx.direction.x * (-130 + u * 222) + perpendicular * jag;
  }

  private mainY(u: number, now: number): number {
    const perpendicular = this.ctx.direction.x;
    const jag = Math.sin(u * 48 + Math.floor(now * 0.018 * this.flicker) * 1.7) * this.jaggedness * 10 * Math.sin(u * Math.PI);
    return this.ctx.origin.y + this.ctx.direction.y * (-130 + u * 222) + perpendicular * jag;
  }

  private updateMain(link: BoltLink, now: number): void {
    const u0 = link.index / 16; const u1 = (link.index + 1) / 16;
    placeBeam(link.mesh, this.mainX(u0, now), this.mainY(u0, now), 32, this.mainX(u1, now), this.mainY(u1, now), 32, 1.2 + this.ctx.energy * 0.32);
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
    placeBeam(link.mesh, x0, y0, 30, x1, y1, 30, 0.65 + this.ctx.energy * 0.16);
  }
}

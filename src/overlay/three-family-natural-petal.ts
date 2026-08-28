import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor, TAU } from './three-family-natural-shared';

type StringPair = { left: THREE.Mesh; right: THREE.Mesh; bead: THREE.Mesh };
type LotusPetal = { mesh: THREE.Mesh; angle: number; layer: number; phase: number };

/** The shared petal preset becomes either a plucked harp or a blooming lotus. */
export class PetalNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly harp: boolean;
  private readonly strings: StringPair[] = [];
  private readonly frame: THREE.Mesh[] = [];
  private readonly petals: LotusPetal[] = [];
  private readonly center: THREE.Mesh | null;
  private readonly aura: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    this.harp = Number.isFinite(ctx.params.arpeggio) || Number.isFinite(ctx.params.grace);
    this.center = this.harp ? null : this.createLotus();
    if (this.harp) this.createHarp();
  }

  update(t: number, now: number): void {
    if (this.harp) this.updateHarp(t, now); else this.updateLotus(t, now);
  }

  private createHarp(): void {
    const frameGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
    const frameMaterial = physicalMaterial(shiftedColor(this.ctx.color, -0.03, -0.03), this.ctx.energy, 'wood');
    for (let i = 0; i < 3; i++) { const beam = new THREE.Mesh(frameGeometry, frameMaterial); this.group.add(beam); this.frame.push(beam); }
    const stringGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
    for (let i = 0; i < 11; i++) {
      const color = shiftedColor(this.ctx.color, i * 0.012, 0.12 + i * 0.008);
      const left = new THREE.Mesh(stringGeometry, additiveMaterial(color, 0.64));
      const right = new THREE.Mesh(stringGeometry, additiveMaterial(color, 0.64));
      const bead = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), additiveMaterial(color, 0.86));
      this.group.add(left, right, bead); this.strings.push({ left, right, bead });
    }
    const o = this.ctx.origin;
    placeBeam(this.frame[0], o.x - 86, o.y - 72, 18, o.x - 58, o.y + 92, 18, 4.5);
    placeBeam(this.frame[1], o.x - 86, o.y - 72, 18, o.x + 92, o.y - 72, 18, 5.5);
    placeBeam(this.frame[2], o.x - 58, o.y + 92, 18, o.x + 92, o.y - 72, 18, 5);
  }

  private createLotus(): THREE.Mesh {
    const petalGeometry = new THREE.SphereGeometry(10, 14, 8);
    for (let layer = 0; layer < 3; layer++) {
      const count = 6 + layer * 3;
      for (let i = 0; i < count; i++) {
        const angle = i / count * TAU + layer * 0.28;
        const mesh = new THREE.Mesh(petalGeometry, physicalMaterial(shiftedColor(this.ctx.color, (i % 3 - 1) * 0.012, 0.04 + layer * 0.045), this.ctx.energy, 'fabric'));
        this.group.add(mesh); this.petals.push({ mesh, angle, layer, phase: (i * 0.137 + layer * 0.19) % 1 });
      }
    }
    const center = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1), additiveMaterial(shiftedColor(this.ctx.color, 0.08, 0.2), 0.9));
    center.position.set(this.ctx.origin.x, this.ctx.origin.y, 34); this.group.add(center);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(28 + i * 17, 1.4, 8, 48), additiveMaterial(shiftedColor(this.ctx.color, i * 0.03, 0.14), 0.42));
      ring.position.set(this.ctx.origin.x, this.ctx.origin.y, 11 - i * 2); ring.scale.y = 0.35; this.group.add(ring); this.aura.push(ring);
    }
    return center;
  }

  private updateHarp(t: number, now: number): void {
    const fade = fadeAt(t, 0.8); const arpeggio = clamp(this.ctx.params.arpeggio ?? 1, 0.5, 3);
    const scatter = clamp(this.ctx.params.scatter ?? 1, 0.5, 2.8); const grace = clamp(this.ctx.params.grace ?? 1, 0.5, 2.8);
    const o = this.ctx.origin;
    for (let i = 0; i < this.strings.length; i++) {
      const x = o.x - 54 + i * 12.5; const lowY = o.y - 66; const highY = o.y + 76 - i * 12;
      const local = t * (6.2 * arpeggio) - i * 0.22; const pulse = Math.exp(-Math.max(0, local) * 1.7) * Math.sin(Math.max(0, local) * TAU * 1.35);
      const bend = local >= 0 ? pulse * 13 * grace : 0; const midY = (lowY + highY) / 2;
      const pair = this.strings[i]; placeBeam(pair.left, x, lowY, 24, x + bend, midY, 28, 0.78); placeBeam(pair.right, x + bend, midY, 28, x, highY, 24, 0.78);
      const travel = ((t * (1.2 + arpeggio * 0.28) + i * 0.083) % 1); const y = lowY + (highY - lowY) * travel;
      pair.bead.position.set(x + Math.sin(travel * Math.PI) * bend + (i - 5) * (scatter - 1) * 2, y, 31);
      pair.bead.rotation.set(now * 0.004 + i, now * 0.006, travel * TAU); pair.bead.scale.setScalar(0.55 + Math.abs(pulse) * 0.7); setOpacity(pair.bead, fade * Math.sin(travel * Math.PI));
      setOpacity(pair.left, fade * (0.5 + Math.abs(pulse) * 0.42)); setOpacity(pair.right, fade * (0.5 + Math.abs(pulse) * 0.42));
    }
    for (const beam of this.frame) { setOpacity(beam, fade * 0.9); }
  }

  private updateLotus(t: number, now: number): void {
    if (!this.center) return;
    const fade = fadeAt(t, 0.8); const bloom = clamp(this.ctx.params.bloom ?? 1, 0.5, 2.8);
    const serenity = clamp(this.ctx.params.serenity ?? 1, 0.5, 2.8); const scatter = clamp(this.ctx.params.scatter ?? 1, 0.5, 2.8);
    for (const petal of this.petals) {
      const opening = Math.sin(clamp((t * bloom - petal.layer * 0.08) / 0.74, 0, 1) * Math.PI / 2);
      const radius = (16 + petal.layer * 24) * opening * scatter; const breathe = Math.sin(now * 0.0018 * serenity + petal.phase * TAU) * 2.5;
      petal.mesh.position.set(this.ctx.origin.x + Math.cos(petal.angle) * (radius + breathe), this.ctx.origin.y + Math.sin(petal.angle) * (radius + breathe) * 0.54, 29 - petal.layer * 6 + opening * petal.layer * 3);
      petal.mesh.rotation.set(0.7 + opening * 0.55 + petal.layer * 0.14, 0.18 * Math.sin(now * 0.001 + petal.phase * TAU), petal.angle - Math.PI / 2);
      petal.mesh.scale.set(0.48 + petal.layer * 0.08, (0.85 + petal.layer * 0.18) * (0.4 + opening * 0.75), 0.18 + opening * 0.11); setOpacity(petal.mesh, fade * (0.7 + opening * 0.26));
    }
    this.center.rotation.set(now * 0.0012, now * 0.002 * serenity, now * 0.001); this.center.scale.setScalar(0.52 + Math.sin(Math.min(1, t * 2.8) * Math.PI / 2) * 0.62); setOpacity(this.center, fade);
    for (let i = 0; i < this.aura.length; i++) { const p = (t * (0.78 + serenity * 0.12) + i * 0.22) % 1; this.aura[i].scale.set(0.4 + p * 2.2, (0.4 + p * 2.2) * 0.35, 1); this.aura[i].rotation.z = now * 0.0005 * (i % 2 ? -1 : 1); setOpacity(this.aura[i], fade * (1 - p) * 0.4); }
  }
}

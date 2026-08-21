import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, shiftedColor, TAU } from './three-family-natural-shared';

const CURTAIN_COLUMNS = 24;
const CURTAIN_ROWS = 3;

/** Aurora uses deforming curtains; dragon uses a jointed serpentine body. */
export class WaveNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly aurora: boolean;
  private readonly curtains: THREE.Mesh[] = [];
  private readonly curtainPositions: Float32Array[] = [];
  private readonly body: THREE.Mesh[] = [];
  private readonly fins: THREE.Mesh[] = [];
  private readonly head: THREE.Mesh | null;

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    this.aurora = Number.isFinite(ctx.params.shimmer) || Number.isFinite(ctx.params.spectral);
    if (this.aurora) {
      this.head = null;
      this.createCurtains();
    } else {
      this.head = this.createDragon();
    }
  }

  update(t: number, now: number): void {
    if (this.aurora) this.updateAurora(t, now);
    else this.updateDragon(t, now);
  }

  private createCurtains(): void {
    const spectral = clamp(this.ctx.params.spectral ?? 1, 0.6, 2.8);
    for (let layer = 0; layer < 4; layer++) {
      const vertices = (CURTAIN_COLUMNS + 1) * (CURTAIN_ROWS + 1);
      const positions = new Float32Array(vertices * 3);
      const indices: number[] = [];
      for (let y = 0; y < CURTAIN_ROWS; y++) for (let x = 0; x < CURTAIN_COLUMNS; x++) {
        const a = y * (CURTAIN_COLUMNS + 1) + x; const b = a + CURTAIN_COLUMNS + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geometry = new THREE.BufferGeometry();
      const attribute = new THREE.BufferAttribute(positions, 3); attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', attribute); geometry.setIndex(indices);
      const color = shiftedColor(this.ctx.color, (layer - 1.5) * 0.045 * spectral, layer * 0.035);
      const mesh = new THREE.Mesh(geometry, additiveMaterial(color, 0.3 + layer * 0.07));
      mesh.position.set(this.ctx.origin.x, this.ctx.origin.y, 0);
      this.group.add(mesh); this.curtains.push(mesh); this.curtainPositions.push(positions);
    }
  }

  private createDragon(): THREE.Mesh {
    const bodyGeometry = new THREE.IcosahedronGeometry(8, 1);
    for (let i = 0; i < 22; i++) {
      const segment = new THREE.Mesh(bodyGeometry, physicalMaterial(shiftedColor(this.ctx.color, i * 0.002, i % 2 ? 0.04 : -0.02), this.ctx.energy));
      this.group.add(segment); this.body.push(segment);
      if (i > 1 && i % 3 === 0) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(4.2, 14, 4), additiveMaterial(shiftedColor(this.ctx.color, 0.06, 0.16), 0.68));
        this.group.add(fin); this.fins.push(fin);
      }
    }
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(15, 1), physicalMaterial(shiftedColor(this.ctx.color, -0.02, 0.08), this.ctx.energy * 1.25));
    this.group.add(head);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(2.5, 24, 6), additiveMaterial(shiftedColor(this.ctx.color, 0.12, 0.24), 0.82));
      horn.rotation.z = -Math.PI / 2 + side * 0.42; horn.position.z = 3; head.add(horn);
      horn.position.x = -7; horn.position.y = side * 8;
    }
    return head;
  }

  private updateAurora(t: number, now: number): void {
    const fade = fadeAt(t, 0.78); const flow = clamp(this.ctx.params.flow ?? 1, 0.5, 3);
    const shimmer = clamp(this.ctx.params.shimmer ?? 1, 0.5, 3); const grow = Math.sin(Math.min(1, t * 1.8) * Math.PI / 2);
    for (let layer = 0; layer < this.curtains.length; layer++) {
      const positions = this.curtainPositions[layer];
      for (let row = 0; row <= CURTAIN_ROWS; row++) for (let column = 0; column <= CURTAIN_COLUMNS; column++) {
        const index = (row * (CURTAIN_COLUMNS + 1) + column) * 3; const u = column / CURTAIN_COLUMNS; const v = row / CURTAIN_ROWS;
        positions[index] = (u - 0.5) * Math.min(this.ctx.width * 0.78, 620);
        positions[index + 1] = grow * (105 - v * (145 + layer * 18) + Math.sin(u * TAU * (1.4 + layer * 0.2) + now * 0.0018 * flow + layer) * (15 + v * 28));
        positions[index + 2] = 6 + layer * 8 + Math.cos(u * TAU * 2 + now * 0.0012 + layer) * 12 * v;
      }
      (this.curtains[layer].geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.curtains[layer].rotation.z = Math.sin(now * 0.0008 + layer) * 0.035;
      setOpacity(this.curtains[layer], fade * (0.25 + layer * 0.08) * (0.72 + Math.sin(now * 0.008 * shimmer + layer) * 0.2));
    }
  }

  private updateDragon(t: number, now: number): void {
    if (!this.head) return;
    const fade = fadeAt(t, 0.74); const amplitude = clamp(this.ctx.params.amplitude ?? 1, 0.5, 2.5);
    const wavelength = clamp(this.ctx.params.wavelength ?? 1, 0.35, 2.5); const undulation = clamp(this.ctx.params.undulation ?? 1, 0.5, 2.8);
    const progress = 1 - Math.pow(1 - t, 2.4); const angle = Math.atan2(this.ctx.direction.y, this.ctx.direction.x);
    for (let i = 0; i < this.body.length; i++) {
      const u = i / (this.body.length - 1); const along = (progress * 300 - 150 - u * 210) * this.ctx.profile.travel;
      const wave = Math.sin(u * TAU / wavelength * 1.7 - now * 0.006 * undulation) * 36 * amplitude * (0.35 + u * 0.65);
      const x = this.ctx.origin.x + this.ctx.direction.x * along - this.ctx.direction.y * wave;
      const y = this.ctx.origin.y + this.ctx.direction.y * along + this.ctx.direction.x * wave;
      const segment = this.body[i]; segment.position.set(x, y, 26 + Math.cos(u * TAU * 2 - now * 0.004) * 15);
      segment.rotation.set(now * 0.002 + u * 2, angle + u, angle + Math.cos(u * 8 - now * 0.004) * 0.42);
      segment.scale.setScalar((1 - u * 0.58) * (0.8 + Math.sin(Math.min(1, t * 3) * Math.PI / 2) * 0.45)); setOpacity(segment, fade);
    }
    for (let i = 0; i < this.fins.length; i++) {
      const anchor = this.body[3 + i * 3]; this.fins[i].position.set(anchor.position.x, anchor.position.y, anchor.position.z + 10);
      this.fins[i].rotation.set(0.5, angle, angle + Math.PI); this.fins[i].scale.setScalar(anchor.scale.x); setOpacity(this.fins[i], fade * 0.78);
    }
    this.head.position.copy(this.body[0].position); this.head.rotation.set(now * 0.002, angle, angle - 0.2);
    this.head.scale.setScalar(1 + Math.sin(Math.min(1, t * 4) * Math.PI / 2) * 0.32); setOpacity(this.head, fade);
  }
}

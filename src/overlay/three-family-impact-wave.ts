import * as THREE from 'three';
import {
  additiveMaterial,
  fadeAt,
  physicalMaterial,
  setOpacity,
  type FamilyContext,
  type FamilyLayer,
} from './three-family-shared';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeOut = (value: number): number => 1 - Math.pow(1 - clamp01(value), 3);

function lightningGeometry(segments: number, height: number): THREE.BufferGeometry {
  const points: number[] = [];
  for (let i = 0; i < segments; i++) {
    const y0 = height - (i / segments) * height;
    const y1 = height - ((i + 1) / segments) * height;
    const x0 = i === 0 ? 0 : Math.sin(i * 2.31) * (10 + i % 4 * 3);
    const x1 = i === segments - 1 ? 0 : Math.sin((i + 1) * 2.31) * (10 + (i + 1) % 4 * 3);
    points.push(x0, y0, 0, x1, y1, 0);
    if (i > 2 && i % 3 === 0) points.push(x1, y1, 0, x1 + (i % 2 ? -1 : 1) * 42, y1 - 32, -2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/** Top-down lightning channel followed by a flattened atmospheric pressure front. */
export class ThunderImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly boltGeometry = lightningGeometry(13, 260);
  private readonly bolt: THREE.LineSegments;
  private readonly flash: THREE.Mesh;
  private readonly pressures: THREE.Mesh[] = [];
  private readonly vertexCount: number;

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin } = ctx;
    this.group.position.copy(origin);
    ctx.root.add(this.group);
    this.bolt = new THREE.LineSegments(this.boltGeometry, additiveMaterial(color, 0.98));
    this.bolt.position.z = 54;
    this.vertexCount = this.boltGeometry.getAttribute('position').count;
    this.boltGeometry.setDrawRange(0, 0);
    this.group.add(this.bolt);
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(24 * energy, 1), additiveMaterial(color, 0.92));
    this.flash.position.z = 42;
    this.group.add(this.flash);
    const count = Math.max(2, Math.min(5, Math.round(ctx.params.rings ?? 3)));
    for (let i = 0; i < count; i++) {
      const pressure = new THREE.Mesh(
        new THREE.RingGeometry(34 + i * 6, 44 + i * 6, 72),
        additiveMaterial(color, 0.82 - i * 0.12),
      );
      pressure.position.z = 20 - i * 3;
      this.group.add(pressure);
      this.pressures.push(pressure);
    }
  }

  update(t: number, now: number): void {
    const strike = easeOut(t / 0.18);
    const fade = fadeAt(t, 0.64);
    const intensity = this.ctx.params.intensity ?? 1;
    const expansion = this.ctx.params.expansion ?? 1;
    this.boltGeometry.setDrawRange(0, Math.floor((this.vertexCount * strike) / 2) * 2);
    this.bolt.position.x = Math.sin(now * 0.09) * (1 - strike) * 5;
    setOpacity(this.bolt, fade * (1 - clamp01((t - 0.34) / 0.3)));
    const flash = Math.sin(clamp01((t - 0.08) / 0.3) * Math.PI);
    this.flash.scale.set(0.35 + flash * intensity, 0.22 + flash * 0.55, 0.35 + flash * intensity);
    this.flash.rotation.z = now * 0.009;
    setOpacity(this.flash, fade * flash);
    for (let i = 0; i < this.pressures.length; i++) {
      const wave = easeOut((t - 0.1 - i * 0.055) / 0.62);
      const pressure = this.pressures[i];
      pressure.scale.set(0.2 + wave * (3.6 + expansion * 0.42), 0.12 + wave * (1.15 + expansion * 0.15), 1);
      pressure.rotation.z = Math.sin(now * 0.002 + i) * 0.08;
      setOpacity(pressure, fade * Math.sin(wave * Math.PI) * Math.min(1.2, intensity));
    }
  }
}

/** Visible drum membrane and paired beaters drive acoustic, not electric, waves. */
export class DrumImpactScene implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly membrane: THREE.Mesh;
  private readonly rim: THREE.Mesh;
  private readonly beaters: THREE.Mesh[] = [];
  private readonly waves: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    const { color, energy, origin } = ctx;
    this.group.position.copy(origin);
    ctx.root.add(this.group);
    this.membrane = new THREE.Mesh(new THREE.CylinderGeometry(68, 68, 7, 48), physicalMaterial(color, energy));
    this.membrane.rotation.x = Math.PI / 2;
    this.membrane.position.z = 30;
    this.group.add(this.membrane);
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(70, 5, 10, 56), additiveMaterial(color, 0.82));
    this.rim.position.z = 36;
    this.group.add(this.rim);
    for (const side of [-1, 1]) {
      const beater = new THREE.Mesh(new THREE.BoxGeometry(7, 94, 7), physicalMaterial(color, energy));
      beater.position.set(side * 48, 72, 48);
      this.group.add(beater);
      this.beaters.push(beater);
    }
    const count = Math.max(2, Math.min(6, Math.round(ctx.params.rings ?? 3)));
    for (let i = 0; i < count; i++) {
      const wave = new THREE.Mesh(new THREE.RingGeometry(34, 38, 56), additiveMaterial(color, 0.54));
      wave.position.z = 18 - i * 2;
      this.group.add(wave);
      this.waves.push(wave);
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.7);
    const intensity = Math.max(0.7, Math.min(2.8, this.ctx.params.intensity ?? 1));
    const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 6)), 3.5 + intensity * 0.75);
    const bass = this.ctx.params.bass ?? 1;
    this.membrane.scale.set(1 + beat * 0.045 * intensity, 1 + beat * 0.045 * intensity, 1 - beat * 0.12 * intensity);
    this.membrane.rotation.z = Math.sin(now * 0.012) * beat * 0.02;
    this.rim.scale.setScalar(1 + beat * 0.035);
    setOpacity(this.membrane, fade);
    setOpacity(this.rim, fade * 0.82);
    for (let i = 0; i < this.beaters.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.beaters[i].rotation.z = side * (0.62 - beat * 0.5);
      this.beaters[i].position.set(side * 48, 72 - beat * 44, 48);
      setOpacity(this.beaters[i], fade);
    }
    for (let i = 0; i < this.waves.length; i++) {
      const phase = (t * (1.7 + bass * 0.18) + i * 0.2) % 1;
      this.waves[i].scale.setScalar(0.3 + phase * (3 + bass * 0.3));
      setOpacity(this.waves[i], fade * (1 - phase) * 0.62);
    }
  }
}

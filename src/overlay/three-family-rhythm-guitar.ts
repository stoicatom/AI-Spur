import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor, TAU } from './three-family-rhythm-shared';

type GuitarString = { left: THREE.Mesh; right: THREE.Mesh; y: number };

/** Six independently plucked strings drive a solid bridge and resonance waves. */
export class GuitarRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly strings: GuitarString[] = [];
  private readonly waves: THREE.Mesh[] = [];
  private readonly body: THREE.Mesh[] = [];
  private readonly bridge: THREE.Mesh;
  private readonly baseAngle: number;

  constructor(private readonly ctx: FamilyContext) {
    this.baseAngle = Math.atan2(ctx.direction.y, ctx.direction.x) * 0.18;
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); this.group.rotation.z = this.baseAngle; ctx.root.add(this.group);
    const bodyMaterial = physicalMaterial(shiftedColor(ctx.color, -0.02, -0.05), ctx.energy, 'wood');
    for (const [x, y, sx, sy] of [[-62, 0, 1.35, 1.08], [-28, -18, 1, 0.82], [-28, 18, 1, 0.82]] as const) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(34, 18, 12), bodyMaterial); lobe.position.set(x, y, 18); lobe.scale.set(sx, sy, 0.35); this.group.add(lobe); this.body.push(lobe);
    }
    const neck = new THREE.Mesh(new THREE.BoxGeometry(145, 30, 9), physicalMaterial(shiftedColor(ctx.color, 0.02, -0.1), ctx.energy, 'wood'));
    neck.position.set(45, 0, 20); this.group.add(neck); this.body.push(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(38, 42, 11), bodyMaterial); head.position.set(125, 0, 21); head.rotation.z = -0.12; this.group.add(head); this.body.push(head);
    this.bridge = new THREE.Mesh(new THREE.BoxGeometry(12, 48, 8), physicalMaterial(shiftedColor(ctx.color, 0.08, 0.18), ctx.energy * 1.15, 'metal'));
    this.bridge.position.set(-30, 0, 29); this.group.add(this.bridge);
    const stringGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
    for (let i = 0; i < 6; i++) {
      const material = additiveMaterial(shiftedColor(ctx.color, i * 0.014, 0.15), 0.76);
      const left = new THREE.Mesh(stringGeometry, material); const right = new THREE.Mesh(stringGeometry, material);
      this.group.add(left, right); this.strings.push({ left, right, y: -12.5 + i * 5 });
    }
    for (let i = 0; i < 4; i++) {
      const wave = new THREE.Mesh(new THREE.TorusGeometry(22 + i * 12, 1.5, 7, 48), additiveMaterial(shiftedColor(ctx.color, i * 0.018, 0.1), 0.55 - i * 0.08));
      wave.position.set(-30, 0, 12 - i * 2); wave.rotation.x = 0.22 + i * 0.16; this.group.add(wave); this.waves.push(wave);
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.76); const strum = clamp(this.ctx.params.strum ?? 1, 0.5, 3);
    const resonance = clamp(this.ctx.params.resonance ?? 1, 0.5, 3); const punch = clamp(this.ctx.params.punch ?? 1, 0.5, 2.8);
    let bridgeEnergy = 0;
    for (let i = 0; i < this.strings.length; i++) {
      const local = t * (3.2 + strum * 0.8) - i * 0.12;
      const envelope = local < 0 ? 0 : Math.exp(-local * (1.8 / resonance));
      const vibration = Math.sin(Math.max(0, local) * TAU * (3.4 + i * 0.18)) * envelope * (5 + punch * 2.5);
      const string = this.strings[i]; placeBeam(string.left, -96, string.y, 29, -28, string.y + vibration, 30, 0.42 + i * 0.06);
      placeBeam(string.right, -28, string.y + vibration, 30, 139, string.y, 30, 0.42 + i * 0.06);
      setOpacity(string.left, fade * (0.5 + envelope * 0.45)); setOpacity(string.right, fade * (0.5 + envelope * 0.45)); bridgeEnergy = Math.max(bridgeEnergy, Math.abs(vibration));
    }
    this.bridge.scale.set(1 + bridgeEnergy * 0.012, 1 + bridgeEnergy * 0.022, 1 + bridgeEnergy * 0.025);
    this.bridge.rotation.z = Math.sin(now * 0.012 * strum) * bridgeEnergy * 0.0025; setOpacity(this.bridge, fade);
    this.group.rotation.z = this.baseAngle + Math.sin(now * 0.003 * strum) * 0.025;
    for (let i = 0; i < this.body.length; i++) { this.body[i].scale.z = i >= 3 ? 1 : 0.35 + bridgeEnergy * 0.002; setOpacity(this.body[i], fade * 0.92); }
    for (let i = 0; i < this.waves.length; i++) {
      const raw = t * (1.25 + resonance * 0.2) - i * 0.13; const p = clamp(raw, 0, 1);
      this.waves[i].scale.setScalar(raw < 0 ? 0.001 : 0.28 + p * (2.8 + punch * 0.4));
      this.waves[i].rotation.z = now * 0.0009 * (i % 2 ? -1 : 1); setOpacity(this.waves[i], raw < 0 ? 0 : fade * (1 - p) * 0.62);
    }
  }
}

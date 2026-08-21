import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, shiftedColor, TAU } from './three-family-rhythm-shared';

/** Vinyl keeps the physical turntable: disc, label, grooves and a bouncing needle. */
export class GrooveRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly disk: THREE.Mesh;
  private readonly label: THREE.Mesh;
  private readonly grooves: THREE.Mesh[] = [];
  private readonly needle: THREE.Group;
  private readonly needleParts: THREE.Mesh[] = [];
  private readonly dust: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); ctx.root.add(this.group);
    this.disk = new THREE.Mesh(new THREE.CylinderGeometry(82, 82, 7, 72), physicalMaterial(shiftedColor(ctx.color, -0.01, -0.24), ctx.energy, 'leather')); this.disk.rotation.x = Math.PI / 2; this.disk.position.z = 22; this.group.add(this.disk);
    this.label = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 9, 36), additiveMaterial(shiftedColor(ctx.color, 0.06, 0.1), 0.84)); this.label.rotation.x = Math.PI / 2; this.label.position.z = 28; this.group.add(this.label);
    const count = Math.round(clamp(6 + (ctx.params.waveOrbit ?? 1) * 2, 5, 13));
    for (let i = 0; i < count; i++) { const groove = new THREE.Mesh(new THREE.TorusGeometry(28 + i * 6.5, 0.85 + (i % 2) * 0.28, 6, 72), additiveMaterial(shiftedColor(ctx.color, 0.01, 0.04), 0.28)); groove.name = `vinyl-groove-${i}`; groove.position.z = 29 + i * 0.16; this.group.add(groove); this.grooves.push(groove); }
    this.needle = new THREE.Group(); const arm = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 96, 8), physicalMaterial(shiftedColor(ctx.color, 0.05, 0.18), ctx.energy, 'metal')); arm.rotation.z = -0.32; arm.position.set(52, 42, 35); this.needle.add(arm); const head = new THREE.Mesh(new THREE.BoxGeometry(9, 15, 7), additiveMaterial(ctx.color, 0.78)); head.position.set(89, 25, 35); this.needle.add(head); this.needleParts.push(arm, head); this.group.add(this.needle);
    for (let i = 0; i < 8; i++) { const particle = new THREE.Mesh(new THREE.OctahedronGeometry(1.7 + i % 2, 0), additiveMaterial(shiftedColor(ctx.color, 0.03, 0.16), 0.58)); particle.name = `vinyl-dust-${i}`; this.group.add(particle); this.dust.push(particle); }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.82); const spin = clamp(this.ctx.params.discSpin ?? 1, 0.5, 3); const flutter = clamp(this.ctx.params.wowFlutter ?? 1, 0.3, 2.5); const needleBounce = clamp(this.ctx.params.needleBounce ?? 1, 0.3, 2.5);
    const groovePulse = clamp(this.ctx.params.groovePulse ?? 1, 0.35, 3); const dustFlicker = clamp(this.ctx.params.dustFlicker ?? 1, 0.25, 3);
    const angle = now * 0.003 * this.ctx.profile.spin * spin; this.disk.rotation.z = angle; this.disk.scale.setScalar(0.88 + Math.sin(now * 0.01 * flutter) * 0.035); this.label.rotation.z = angle;
    setOpacity(this.disk, fade); setOpacity(this.label, fade);
    for (let i = 0; i < this.grooves.length; i++) {
      const wave = 0.5 + Math.sin(now * 0.007 * groovePulse - i * 0.9) * 0.5;
      const radius = 0.86 + wave * (0.018 + groovePulse * 0.016);
      this.grooves[i].rotation.z = angle * (i % 2 ? -1 : 1); this.grooves[i].scale.set(radius, radius, 1 + wave * groovePulse * 0.08);
      setOpacity(this.grooves[i], fade * (0.34 + wave * Math.min(0.42, groovePulse * 0.18)));
    }
    this.needle.rotation.z = -0.02 + Math.sin(now * 0.006 * flutter) * 0.025 * needleBounce; for (const part of this.needleParts) setOpacity(part, fade * 0.92);
    for (let i = 0; i < this.dust.length; i++) {
      const p = (t * (0.32 + dustFlicker * 0.24 + i * 0.02) + i * 0.17) % 1; const a = angle + i * 0.8;
      const glint = Math.pow(Math.max(0, Math.sin(now * 0.018 * dustFlicker + i * 2.17)), 3);
      this.dust[i].position.set(Math.cos(a) * (24 + p * 55), Math.sin(a) * (24 + p * 55), 34 + i % 3 * 3 + glint * 7);
      this.dust[i].rotation.set(now * 0.003 * dustFlicker + i, now * 0.004 * dustFlicker, a);
      this.dust[i].scale.setScalar(0.65 + glint * (0.45 + dustFlicker * 0.16)); setOpacity(this.dust[i], fade * (1 - p) * (0.2 + glint * 0.66));
    }
  }
}

/** Drum: a real stretched membrane, rim, lugs and concentric pressure modes. */
export class DrumRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly membrane: THREE.Mesh;
  private readonly rim: THREE.Mesh;
  private readonly lugs: THREE.Mesh[] = [];
  private readonly modes: THREE.Mesh[] = [];
  private readonly mallets: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); ctx.root.add(this.group);
    this.membrane = new THREE.Mesh(new THREE.CylinderGeometry(72, 72, 5, 64), physicalMaterial(shiftedColor(ctx.color, -0.02, 0.02), ctx.energy, 'fabric')); this.membrane.name = 'drum-membrane'; this.membrane.rotation.x = Math.PI / 2; this.membrane.position.z = 24; this.group.add(this.membrane);
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(74, 5, 10, 64), additiveMaterial(shiftedColor(ctx.color, 0.02, 0.16), 0.82)); this.rim.position.z = 31; this.group.add(this.rim);
    for (let i = 0; i < 10; i++) { const lug = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 12), physicalMaterial(shiftedColor(ctx.color, 0.04, -0.06), ctx.energy, 'metal')); const a = i / 10 * Math.PI * 2; lug.position.set(Math.cos(a) * 78, Math.sin(a) * 78, 25); lug.rotation.z = a; this.group.add(lug); this.lugs.push(lug); }
    const count = Math.round(clamp(ctx.params.rings ?? ctx.params.intensity ?? 3, 3, 9));
    for (let i = 0; i < count; i++) { const mode = new THREE.Mesh(new THREE.TorusGeometry(22 + i * 14, 1.8, 8, 52), additiveMaterial(shiftedColor(ctx.color, i * 0.01, 0.1), 0.5 - i * 0.055)); mode.name = `drum-mode-${i}`; mode.position.z = 15 - i * 1.8; this.group.add(mode); this.modes.push(mode); }
    for (const side of [-1, 1]) { const mallet = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 52, 8), physicalMaterial(shiftedColor(ctx.color, 0.05, 0.2), ctx.energy, 'wood')); mallet.position.set(side * 38, 93, 36); mallet.rotation.z = side * 0.26; this.group.add(mallet); this.mallets.push(mallet); }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.78); const bass = clamp(this.ctx.params.bass ?? 1, 0.5, 3); const intensity = clamp(this.ctx.params.intensity ?? 1, 0.5, 3);
    const hit = Math.pow(Math.abs(Math.sin(t * TAU * (1.6 + bass * 1.05))), 8); const tremor = Math.sin(now * 0.008 * bass) * 0.012 * intensity;
    this.membrane.scale.set(1 + hit * 0.045, 1 + hit * 0.045, 1 + hit * (0.12 + bass * 0.025)); this.membrane.rotation.z = tremor; setOpacity(this.membrane, fade);
    this.rim.scale.setScalar(1 + hit * 0.06); this.rim.rotation.z = tremor * 2; setOpacity(this.rim, fade * 0.84);
    for (let i = 0; i < this.lugs.length; i++) { this.lugs[i].scale.setScalar(1 + hit * 0.04); setOpacity(this.lugs[i], fade * 0.76); }
    for (let i = 0; i < this.modes.length; i++) { const p = (t * (1.2 + intensity * 0.48) + i * 0.15) % 1; const scale = 0.24 + p * (2.1 + bass * 0.45 + intensity * 0.35); this.modes[i].scale.setScalar(scale); this.modes[i].rotation.z = now * 0.0012 * (i % 2 ? -1 : 1); setOpacity(this.modes[i], fade * (1 - p) * Math.min(0.92, 0.46 + intensity * 0.18)); }
    for (let i = 0; i < this.mallets.length; i++) { const strike = Math.max(0, Math.sin(t * TAU * (2 + bass) - i * 2.8)); this.mallets[i].position.y = 93 - strike * 44; this.mallets[i].rotation.z = (i ? -1 : 1) * (0.26 - strike * 0.2); setOpacity(this.mallets[i], fade * 0.86); }
  }
}

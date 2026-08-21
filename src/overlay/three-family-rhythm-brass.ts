import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor, TAU } from './three-family-rhythm-shared';

/** A swinging bell shell, counter-moving clapper and discrete echo fronts. */
export class BellRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly assembly = new THREE.Group();
  private readonly clapper = new THREE.Group();
  private readonly shell: THREE.Mesh;
  private readonly cap: THREE.Mesh;
  private readonly rim: THREE.Mesh;
  private readonly clapperParts: THREE.Mesh[] = [];
  private readonly echoes: THREE.Mesh[] = [];

  constructor(private readonly ctx: FamilyContext) {
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); ctx.root.add(this.group); this.group.add(this.assembly);
    const shellMaterial = physicalMaterial(shiftedColor(ctx.color, 0.04, 0.06), ctx.energy, 'metal'); shellMaterial.side = THREE.DoubleSide;
    this.shell = new THREE.Mesh(new THREE.CylinderGeometry(18, 44, 66, 32, 1, true), shellMaterial); this.shell.position.set(0, 8, 27); this.assembly.add(this.shell);
    this.cap = new THREE.Mesh(new THREE.SphereGeometry(20, 20, 10), physicalMaterial(shiftedColor(ctx.color, 0.02, 0.12), ctx.energy, 'metal'));
    this.cap.position.set(0, 40, 27); this.cap.scale.y = 0.52; this.assembly.add(this.cap);
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(45, 4.2, 9, 56), additiveMaterial(shiftedColor(ctx.color, 0.08, 0.18), 0.84));
    this.rim.position.set(0, -25, 27); this.rim.rotation.x = 1.06; this.assembly.add(this.rim);
    this.clapper.position.set(0, 17, 29); this.assembly.add(this.clapper);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 42, 8), physicalMaterial(ctx.color, ctx.energy, 'metal')); stem.position.y = -19; this.clapper.add(stem); this.clapperParts.push(stem);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 9), additiveMaterial(shiftedColor(ctx.color, 0.08, 0.2), 0.9)); ball.position.y = -42; this.clapper.add(ball); this.clapperParts.push(ball);
    for (let i = 0; i < 5; i++) {
      const echo = new THREE.Mesh(new THREE.TorusGeometry(24 + i * 11, 1.8, 8, 52), additiveMaterial(shiftedColor(ctx.color, i * 0.015, 0.12), 0.56 - i * 0.06));
      echo.position.set(0, -28, 12 - i * 2); echo.scale.y = 0.55; this.group.add(echo); this.echoes.push(echo);
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.78); const echoes = clamp(this.ctx.params.echoes ?? 3, 1, 6);
    const ring = clamp(this.ctx.params.ring ?? 1, 0.5, 3); const decay = clamp(this.ctx.params.decay ?? 1, 0.5, 3);
    const envelope = Math.exp(-t * (1.2 + decay * 0.55)); const swing = Math.sin(t * TAU * (1.8 + echoes * 0.24)) * envelope * 0.52 * ring;
    this.assembly.rotation.set(0.08, Math.sin(now * 0.0012) * 0.08, swing); this.clapper.rotation.z = -swing * 1.65;
    this.shell.scale.set(1 + Math.abs(swing) * 0.045, 1, 1); this.cap.scale.set(1, 0.52 + Math.abs(swing) * 0.04, 1);
    setOpacity(this.shell, fade); setOpacity(this.cap, fade); setOpacity(this.rim, fade * (0.74 + Math.abs(swing) * 0.2));
    for (const part of this.clapperParts) setOpacity(part, fade * 0.9);
    for (let i = 0; i < this.echoes.length; i++) {
      const raw = t * (0.9 + echoes * 0.22) - i * 0.17; const p = clamp(raw, 0, 1);
      this.echoes[i].scale.set(raw < 0 ? 0.001 : 0.3 + p * (3 + ring * 0.45), raw < 0 ? 0.001 : (0.3 + p * (3 + ring * 0.45)) * 0.55, 1);
      this.echoes[i].rotation.z = Math.sin(now * 0.0016 + i) * 0.08; setOpacity(this.echoes[i], raw < 0 ? 0 : fade * (1 - p) * 0.62 / (1 + i * 0.08));
    }
  }
}

/** A modeled horn projects nested conical pressure beams instead of rings. */
export class TrumpetRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly metal: THREE.Mesh[] = [];
  private readonly valves: THREE.Mesh[] = [];
  private readonly beams: THREE.Mesh[] = [];
  private readonly fronts: THREE.Mesh[] = [];
  private readonly baseAngle: number;

  constructor(private readonly ctx: FamilyContext) {
    this.baseAngle = Math.atan2(ctx.direction.y, ctx.direction.x) * 0.24;
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); this.group.rotation.z = this.baseAngle; ctx.root.add(this.group);
    const material = physicalMaterial(shiftedColor(ctx.color, 0.04, 0.08), ctx.energy, 'metal');
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), material); placeBeam(body, -98, 0, 25, 48, 0, 25, 7); this.group.add(body); this.metal.push(body);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), material); placeBeam(mouth, -124, 0, 25, -94, 0, 25, 4); this.group.add(mouth); this.metal.push(mouth);
    const bellMaterial = physicalMaterial(shiftedColor(ctx.color, 0.06, 0.12), ctx.energy, 'metal'); bellMaterial.side = THREE.DoubleSide;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(12, 38, 62, 36, 1, true), bellMaterial); bell.position.set(76, 0, 25); bell.rotation.z = Math.PI / 2; this.group.add(bell); this.metal.push(bell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(38, 3.4, 9, 52), additiveMaterial(shiftedColor(ctx.color, 0.08, 0.2), 0.82)); rim.position.set(107, 0, 25); rim.rotation.y = Math.PI / 2; this.group.add(rim); this.metal.push(rim);
    for (let i = 0; i < 3; i++) {
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 36, 10), material); valve.position.set(-28 + i * 21, 13, 27); this.group.add(valve); this.valves.push(valve);
    }
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(30 + i * 16, 136 + i * 36, 32, 1, true), additiveMaterial(shiftedColor(ctx.color, i * 0.025, 0.14), 0.13 - i * 0.025));
      beam.position.set(175 + i * 18, 0, 22 - i * 3); beam.rotation.z = Math.PI / 2; this.group.add(beam); this.beams.push(beam);
      const front = new THREE.Mesh(new THREE.TorusGeometry(28 + i * 14, 2, 8, 52), additiveMaterial(shiftedColor(ctx.color, i * 0.028, 0.2), 0.56 - i * 0.08));
      front.position.set(120 + i * 48, 0, 28 - i); front.scale.y = 0.62; this.group.add(front); this.fronts.push(front);
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.74); const fanfare = clamp(this.ctx.params.fanfare ?? 1, 0.5, 3);
    const brass = clamp(this.ctx.params.brass ?? 1, 0.5, 3); const projection = clamp(this.ctx.params.projection ?? 1, 0.5, 3);
    const breath = Math.sin(Math.min(1, t * 3.4) * Math.PI / 2) * fade;
    this.group.rotation.z = this.baseAngle - breath * projection * 0.025 + Math.sin(now * 0.003 * brass) * 0.012;
    for (let i = 0; i < this.valves.length; i++) { const press = Math.max(0, Math.sin(t * TAU * fanfare * 2.2 - i * 1.4)); this.valves[i].position.y = 13 - press * 10; setOpacity(this.valves[i], fade); }
    for (const mesh of this.metal) setOpacity(mesh, fade * (0.82 + breath * 0.16));
    for (let i = 0; i < this.beams.length; i++) {
      const raw = t * (1.05 + fanfare * 0.18) - i * 0.11; const p = clamp(raw, 0, 1);
      this.beams[i].scale.set(0.6 + p * projection * 0.32, raw < 0 ? 0.001 : 0.15 + p * projection, 0.6 + p * projection * 0.32);
      setOpacity(this.beams[i], raw < 0 ? 0 : fade * breath * (1 - p * 0.45) * (0.16 - i * 0.025));
      this.fronts[i].position.x = 116 + p * (96 + i * 34) * projection; this.fronts[i].scale.set(0.34 + p * (1.8 + projection * 0.35), (0.34 + p * (1.8 + projection * 0.35)) * 0.62, 1);
      setOpacity(this.fronts[i], raw < 0 ? 0 : fade * (1 - p) * 0.66);
    }
  }
}

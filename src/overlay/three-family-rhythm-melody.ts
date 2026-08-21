import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, placeBeam, shiftedColor, TAU } from './three-family-rhythm-shared';

type PianoKey = { mesh: THREE.Mesh; x: number; phase: number };
type SaxNote = { group: THREE.Group; parts: THREE.Mesh[]; phase: number; scale: number };

/** A playable keyboard whose keys trigger octave arcs and sustain trails. */
export class PianoRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly whiteKeys: PianoKey[] = [];
  private readonly blackKeys: PianoKey[] = [];
  private readonly trails: THREE.Mesh[] = [];
  private readonly arcs: THREE.Mesh[] = [];
  private readonly frame: THREE.Mesh;

  constructor(private readonly ctx: FamilyContext) {
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); ctx.root.add(this.group);
    const count = Math.round(clamp(ctx.params.keyCount ?? 7, 5, 10)); const spacing = 28;
    const width = count * spacing + 16;
    this.frame = new THREE.Mesh(new THREE.BoxGeometry(width, 96, 8), physicalMaterial(shiftedColor(ctx.color, -0.02, -0.14), ctx.energy, 'wood'));
    this.frame.position.set(0, -5, 12); this.group.add(this.frame);
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spacing;
      const key = new THREE.Mesh(new THREE.BoxGeometry(24, 82, 10), physicalMaterial(shiftedColor(ctx.color, i * 0.008, 0.15), ctx.energy, 'glass'));
      key.position.set(x, -4, 22); this.group.add(key); this.whiteKeys.push({ mesh: key, x, phase: i / count });
      const trail = new THREE.Mesh(new THREE.BoxGeometry(5, 80 + i % 3 * 16, 3), additiveMaterial(shiftedColor(ctx.color, i * 0.012, 0.2), 0.48));
      trail.position.set(x, 70, 18); this.group.add(trail); this.trails.push(trail);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(34 + i * 3, 1.4, 7, 38, Math.PI), additiveMaterial(shiftedColor(ctx.color, i * 0.01, 0.12), 0.46));
      arc.position.set(x, 42, 13 + i % 3); arc.rotation.z = -Math.PI / 2; this.group.add(arc); this.arcs.push(arc);
      if (i < count - 1 && ![2, 6].includes(i % 7)) {
        const black = new THREE.Mesh(new THREE.BoxGeometry(15, 50, 15), physicalMaterial(shiftedColor(ctx.color, 0.04, -0.28), ctx.energy, 'wood'));
        black.position.set(x + spacing / 2, 10, 31); this.group.add(black); this.blackKeys.push({ mesh: black, x: x + spacing / 2, phase: (i + 0.5) / count });
      }
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.8); const bounce = clamp(this.ctx.params.keyBounce ?? 1, 0.5, 2.8);
    const spread = clamp(this.ctx.params.chordSpread ?? 1, 0.5, 2.8); const rise = clamp(this.ctx.params.noteRise ?? 1, 0.5, 2.8);
    const sustain = clamp(this.ctx.params.sustainTrails ?? 1, 0.5, 3); const octave = clamp(this.ctx.params.octaveArc ?? 1, 0.35, 2.5);
    for (let i = 0; i < this.whiteKeys.length; i++) {
      const key = this.whiteKeys[i]; const pulse = Math.pow(Math.max(0, Math.sin(t * TAU * (1.4 + octave * 0.24) - i * 0.82)), 5);
      key.mesh.position.set(key.x, -4 - pulse * 8 * bounce, 22 - pulse * 7); key.mesh.rotation.x = pulse * 0.09; setOpacity(key.mesh, fade * (0.82 + pulse * 0.18));
      const p = (t * (0.65 + sustain * 0.18) + key.phase) % 1; const trail = this.trails[i];
      trail.position.set(key.x + Math.sin(p * TAU + i) * 5 * spread, 34 + p * 155 * rise, 18 + p * 12); trail.scale.y = 0.28 + (1 - p) * sustain * 0.52;
      setOpacity(trail, fade * Math.sin(p * Math.PI) * 0.5);
      const arc = this.arcs[i]; arc.position.x = key.x + Math.sin(now * 0.0015 + i) * 3; arc.scale.set(0.35 + p * octave, (0.35 + p * octave) * (0.65 + spread * 0.12), 1); setOpacity(arc, fade * (1 - p) * 0.5);
    }
    for (let i = 0; i < this.blackKeys.length; i++) { const key = this.blackKeys[i]; const pulse = Math.pow(Math.max(0, Math.sin(t * TAU * (1.7 + octave * 0.2) - i * 1.12)), 6); key.mesh.position.set(key.x, 10 - pulse * 6 * bounce, 31 - pulse * 8); key.mesh.rotation.x = pulse * 0.08; setOpacity(key.mesh, fade); }
    this.frame.scale.x = 1 + Math.sin(now * 0.006) * 0.006 * spread; setOpacity(this.frame, fade * 0.92);
  }
}

/** A curved sax body exhales spiral notes from its modeled bell. */
export class SaxRhythmStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly pipes: THREE.Mesh[] = [];
  private readonly keys: THREE.Mesh[] = [];
  private readonly notes: SaxNote[] = [];
  private readonly bell: THREE.Mesh;
  private readonly baseAngle: number;

  constructor(private readonly ctx: FamilyContext) {
    this.baseAngle = Math.atan2(ctx.direction.y, ctx.direction.x) * 0.2;
    this.group.position.set(ctx.origin.x, ctx.origin.y, 0); this.group.rotation.z = this.baseAngle; ctx.root.add(this.group); this.group.add(this.body);
    const material = physicalMaterial(shiftedColor(ctx.color, 0.04, 0.06), ctx.energy, 'wood');
    const points = [[-45, 78], [-28, 48], [-22, 12], [-18, -28], [-4, -62], [25, -75], [52, -57]] as const;
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 10);
    for (let i = 0; i < points.length - 1; i++) {
      const pipe = new THREE.Mesh(geometry, material); placeBeam(pipe, points[i][0], points[i][1], 24, points[i + 1][0], points[i + 1][1], 24, 7 + i * 0.7);
      this.body.add(pipe); this.pipes.push(pipe);
    }
    const neck = new THREE.Mesh(geometry, material); placeBeam(neck, -45, 78, 24, -78, 92, 24, 5); this.body.add(neck); this.pipes.push(neck);
    const bellMaterial = physicalMaterial(shiftedColor(ctx.color, 0.07, 0.13), ctx.energy, 'metal'); bellMaterial.side = THREE.DoubleSide;
    this.bell = new THREE.Mesh(new THREE.CylinderGeometry(10, 29, 46, 32, 1, true), bellMaterial); this.bell.position.set(72, -47, 24); this.bell.rotation.z = Math.PI / 2; this.body.add(this.bell);
    for (let i = 0; i < 8; i++) {
      const key = new THREE.Mesh(new THREE.SphereGeometry(3.8 + i % 2, 10, 7), additiveMaterial(shiftedColor(ctx.color, 0.1, 0.2), 0.76));
      key.position.set(-5 + Math.sin(i * 0.8) * 18, 42 - i * 15, 34); this.body.add(key); this.keys.push(key);
    }
    for (let i = 0; i < 12; i++) {
      const note = new THREE.Group(); const noteMaterial = additiveMaterial(shiftedColor(ctx.color, i * 0.014, 0.16), 0.82);
      const head = new THREE.Mesh(new THREE.SphereGeometry(5 + i % 3, 11, 8), noteMaterial); const stem = new THREE.Mesh(new THREE.BoxGeometry(2, 22 + i % 3 * 5, 2), noteMaterial);
      stem.position.set(5, 10, 0); note.add(head, stem); this.group.add(note); this.notes.push({ group: note, parts: [head, stem], phase: i / 12, scale: 0.7 + i % 4 * 0.1 });
    }
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.8); const spiral = clamp(this.ctx.params.noteSpiral ?? 1, 0.5, 3);
    const brass = clamp(this.ctx.params.brassGlow ?? 1, 0.5, 2.8); const breath = clamp(this.ctx.params.breathFlow ?? 1, 0.5, 2.8);
    const vibrato = clamp(this.ctx.params.vibrato ?? 1, 0.5, 3); const phrase = clamp(this.ctx.params.phraseLength ?? 1, 0.5, 3);
    const burst = clamp(this.ctx.params.bellBurst ?? 1, 0.5, 2.8); const sway = Math.sin(now * 0.005 * vibrato) * 0.045;
    this.body.rotation.set(0.06 + Math.sin(now * 0.002) * 0.04, 0, sway); this.body.position.set(-sway * 24, Math.abs(sway) * 8, 0);
    for (const pipe of this.pipes) setOpacity(pipe, fade * (0.78 + Math.abs(sway) * brass));
    for (let i = 0; i < this.keys.length; i++) { const press = Math.max(0, Math.sin(t * TAU * phrase * 1.4 - i * 0.9)); this.keys[i].scale.setScalar(0.75 + press * 0.45); setOpacity(this.keys[i], fade * (0.62 + press * 0.34)); }
    this.bell.scale.set(1, 1 + Math.sin(now * 0.009 * vibrato) * 0.035 * burst, 1); setOpacity(this.bell, fade);
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i]; const p = (t * (0.58 + breath * 0.22) + note.phase) % 1; const angle = p * TAU * spiral * 1.25 + i * 0.57;
      const radius = (10 + p * 64) * brass; note.group.position.set(92 + p * 150 * phrase + Math.cos(angle) * radius * 0.32, -48 + Math.sin(angle) * radius, 28 + Math.cos(angle * 0.7) * 16);
      note.group.rotation.z = angle * 0.35 + Math.sin(now * 0.004 + i) * 0.12; note.group.scale.setScalar(note.scale * (0.45 + Math.sin(p * Math.PI) * burst));
      for (const part of note.parts) setOpacity(part, fade * Math.sin(p * Math.PI));
    }
  }
}

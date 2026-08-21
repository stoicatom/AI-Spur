import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, setObjectOpacity, TAU } from './three-family-cosmic-shared';

export type MoonPhaseParams = {
  arcLength: number;
  glowTrail: number;
  elegance: number;
  echoCount: number;
};

export function resolveMoonPhaseParams(params: Record<string, number>): MoonPhaseParams {
  const arcLength = clamp(cosmicParam(params, ['arcLength'], 1), 0.55, 2.8);
  const glowTrail = clamp(cosmicParam(params, ['glowTrail'], 1), 0.35, 3.5);
  const elegance = clamp(cosmicParam(params, ['elegance'], 1), 0.5, 2.5);
  return { arcLength, glowTrail, elegance, echoCount: Math.round(3 + glowTrail * 2.4) };
}

function crescentGeometry(radius: number, elegance: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const segments = 36;
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI / 2 + i / segments * Math.PI;
    const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = 0; i <= segments; i++) {
    const u = i / segments; const y = (u * 2 - 1) * radius;
    const belly = Math.sin(u * Math.PI);
    const phaseInset = clamp(0.34 + elegance * 0.11, 0.38, 0.62);
    const x = -radius * phaseInset * belly;
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelSegments: 3,
    bevelSize: 1.8 + elegance * 0.7, bevelThickness: 1.6 + elegance * 0.55,
    curveSegments: segments,
  });
}

/** A true extruded crescent follows a lunar arc with phase echoes and stardust. */
export class MoonPhaseStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly settings: MoonPhaseParams;
  private readonly group = new THREE.Group();
  private readonly moon = new THREE.Group();
  private readonly echoes: THREE.LineSegments[] = [];
  private readonly dust: THREE.Mesh[] = [];
  private readonly halo: THREE.Mesh;

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; this.settings = resolveMoonPhaseParams(ctx.params);
    ctx.root.add(this.group); this.group.add(this.moon);
    const { elegance, echoCount } = this.settings;
    const geometry = crescentGeometry(35 * ctx.energy, elegance, 7 + elegance * 3);
    const body = new THREE.Mesh(geometry, physicalMaterial(ctx.color.clone().offsetHSL(0, -0.08, 0.2), ctx.energy, 'rock'));
    body.position.z = -5; this.moon.add(body);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 22), new THREE.LineBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }));
    rim.position.z = -5; this.moon.add(rim);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(46 * ctx.energy, 2.4, 10, 72, Math.PI * 1.72), additiveMaterial(ctx.color, 0.42));
    this.halo.rotation.z = -Math.PI * 0.36; this.moon.add(this.halo);
    for (let i = 0; i < echoCount; i++) {
      const echo = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), new THREE.LineBasicMaterial({ color: ctx.color.clone().offsetHSL(i * 0.012, 0, 0.08), transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.group.add(echo); this.echoes.push(echo);
    }
    const dustCount = 9 + echoCount;
    for (let i = 0; i < dustCount; i++) {
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(2.2 + i % 3, 0), additiveMaterial(ctx.color.clone().offsetHSL((i % 4 - 1.5) * 0.018, 0, 0.16), 0.74));
      this.group.add(mote); this.dust.push(mote);
    }
  }

  update(t: number, now: number): void {
    const { arcLength, glowTrail, elegance } = this.settings;
    const travel = easeOut(t); const fade = fadeAt(t, 0.78);
    const span = 0.52 + arcLength * 0.36; const angle = -span + travel * span * 2;
    const radiusX = 78 + arcLength * 38; const radiusY = 34 + elegance * 23;
    const x = this.ctx.origin.x + Math.sin(angle) * radiusX;
    const y = this.ctx.origin.y + Math.cos(angle) * radiusY - radiusY * 0.72 + travel * 34;
    const bank = angle * (0.32 + elegance * 0.16);
    this.moon.position.set(x, y, 38); this.moon.rotation.set(-0.12 * elegance, Math.sin(angle) * 0.22 * elegance, bank);
    const reveal = 0.42 + easeOut(t * 3.4) * 0.58;
    this.moon.scale.setScalar(reveal); setObjectOpacity(this.moon, fade);
    this.halo.rotation.z = -Math.PI * 0.36 + now * 0.00022 * elegance;
    this.halo.scale.setScalar(0.86 + Math.sin(now * 0.004 * glowTrail) * 0.08);
    setOpacity(this.halo, fade * (0.26 + glowTrail * 0.1));

    for (let i = 0; i < this.echoes.length; i++) {
      const lag = (i + 1) / this.echoes.length * (0.08 + glowTrail * 0.035);
      const p = Math.max(0, travel - lag); const echoAngle = -span + p * span * 2;
      this.echoes[i].position.set(
        this.ctx.origin.x + Math.sin(echoAngle) * radiusX,
        this.ctx.origin.y + Math.cos(echoAngle) * radiusY - radiusY * 0.72 + p * 34,
        27 - i * 1.2,
      );
      this.echoes[i].rotation.set(-0.12 * elegance, Math.sin(echoAngle) * 0.22 * elegance, echoAngle * (0.32 + elegance * 0.16));
      this.echoes[i].scale.setScalar(reveal * (1 - i / this.echoes.length * 0.18));
      setOpacity(this.echoes[i], fade * glowTrail * 0.12 * (1 - i / this.echoes.length));
    }
    for (let i = 0; i < this.dust.length; i++) {
      const phase = i / this.dust.length; const p = (travel + phase * 0.46) % 1;
      const dustAngle = -span + p * span * 2 + Math.sin(i * 2.13) * 0.12;
      const wake = 1 - p;
      this.dust[i].position.set(this.ctx.origin.x + Math.sin(dustAngle) * radiusX, this.ctx.origin.y + Math.cos(dustAngle) * radiusY - radiusY * 0.72 + p * 34 + Math.sin(i * TAU / 5) * 9, 22 + i % 4);
      this.dust[i].rotation.set(now * 0.001 + i, -dustAngle, now * 0.0018 * elegance);
      this.dust[i].scale.setScalar(0.35 + wake * 0.55 * glowTrail);
      setOpacity(this.dust[i], fade * Math.sin(p * Math.PI) * 0.68);
    }
  }
}

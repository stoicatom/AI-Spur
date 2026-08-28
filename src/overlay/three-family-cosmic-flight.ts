import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, setObjectOpacity, TAU } from './three-family-cosmic-shared';

/** Rocket silhouette, clustered nozzles, exhaust stack and a trailing Mach cone. */
export class RocketJetStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly craft = new THREE.Group();
  private readonly flames: THREE.Mesh[] = [];
  private readonly machCone: THREE.Mesh;
  private readonly boomRing: THREE.Mesh;

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.craft);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(10, 14, 58, 12), physicalMaterial(ctx.color, ctx.energy, 'metal'));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(10, 27, 12), physicalMaterial(ctx.color.clone().offsetHSL(0.03, 0, 0.18), ctx.energy, 'metal'));
    hull.position.y = 0; nose.position.y = 42; this.craft.add(hull, nose);
    const window = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 10), additiveMaterial(new THREE.Color(0xcaf7ff), 0.88));
    window.position.set(0, 14, 10); window.scale.z = 0.35; this.craft.add(window);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(4, 28, 12), physicalMaterial(ctx.color.clone().offsetHSL(-0.03, 0, -0.12), ctx.energy, 'metal'));
      fin.position.set(side * 13, -20, 0); fin.rotation.z = side * -0.28; this.craft.add(fin);
    }
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 9;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 11, 10), physicalMaterial(new THREE.Color(0x303744), ctx.energy, 'metal'));
      nozzle.position.set(x, -34, 0); this.craft.add(nozzle);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(5.5, 1, 10), additiveMaterial(ctx.color.clone().offsetHSL(0.02, 0, 0.22), 0.9));
      flame.position.set(x, -48, 0); flame.rotation.z = Math.PI; this.craft.add(flame); this.flames.push(flame);
    }
    this.machCone = new THREE.Mesh(new THREE.ConeGeometry(48, 92, 32, 1, true), new THREE.MeshBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.25, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.machCone.rotation.z = Math.PI; this.group.add(this.machCone);
    this.boomRing = new THREE.Mesh(new THREE.TorusGeometry(44, 2.2, 8, 64), additiveMaterial(ctx.color, 0.5));
    this.group.add(this.boomRing);
  }

  update(t: number, now: number): void {
    const thrust = clamp(cosmicParam(this.ctx.params, ['thrust'], 1), 0.45, 2.8);
    const tail = clamp(cosmicParam(this.ctx.params, ['tailLength'], 1), 0.5, 3);
    const climb = clamp(cosmicParam(this.ctx.params, ['climb'], 1), 0.45, 2.4);
    const launch = easeOut((t - 0.1) / 0.9); const charge = Math.min(1, t / 0.1);
    const x = this.ctx.origin.x + this.ctx.direction.x * launch * 34;
    const y = this.ctx.origin.y - Math.sin(charge * Math.PI) * 7 + launch * 188 * climb;
    this.craft.position.set(x, y, 42); this.craft.rotation.z = -this.ctx.direction.x * 0.16;
    this.craft.scale.setScalar(0.9 + launch * 0.22); setObjectOpacity(this.craft, fadeAt(t, 0.76));
    for (let i = 0; i < this.flames.length; i++) {
      const flicker = 0.82 + Math.sin(now * 0.025 + i * 2.1) * 0.18;
      this.flames[i].scale.set(0.75 + thrust * 0.16, (22 + thrust * 22) * tail * flicker, 0.8);
      setOpacity(this.flames[i], fadeAt(t, 0.83) * (0.75 + flicker * 0.18));
    }
    const boom = clamp((t - 0.2) / 0.32, 0, 1);
    this.machCone.position.set(x, y - 82 - tail * 18, 22); this.machCone.scale.set(0.55 + boom * 0.8, 0.72 + tail * 0.18, 0.55 + boom * 0.8);
    setOpacity(this.machCone, fadeAt(t, 0.66) * boom * 0.32);
    this.boomRing.position.set(x, y - 48, 20); this.boomRing.scale.setScalar(0.3 + boom * 2.25);
    setOpacity(this.boomRing, fadeAt(t, 0.55) * boom * (1 - boom) * 1.8);
  }
}

function wingGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 8); shape.bezierCurveTo(-28, 28, -78, 48, -116, 25);
  shape.lineTo(-82, 4); shape.lineTo(-108, -10); shape.lineTo(-58, -4);
  shape.lineTo(-76, -25); shape.lineTo(-28, -12); shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Phoenix wing planes beat around a rising body while feathers mark lift flow. */
export class PhoenixRiseStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly bird = new THREE.Group();
  private readonly leftWing: THREE.Mesh;
  private readonly rightWing: THREE.Mesh;
  private readonly feathers: THREE.Mesh[] = [];
  private readonly liftPaths: THREE.Mesh[] = [];

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.bird);
    const wingColor = ctx.color.clone().offsetHSL(0.02, 0, 0.12);
    this.leftWing = new THREE.Mesh(wingGeometry(), additiveMaterial(wingColor, 0.74));
    this.rightWing = new THREE.Mesh(wingGeometry(), additiveMaterial(wingColor, 0.74));
    this.leftWing.position.z = 26; this.rightWing.position.z = 26; this.bird.add(this.leftWing, this.rightWing);
    const body = new THREE.Mesh(new THREE.ConeGeometry(12, 52, 9), physicalMaterial(ctx.color, ctx.energy, 'fabric'));
    const head = new THREE.Mesh(new THREE.SphereGeometry(10, 14, 9), physicalMaterial(wingColor, ctx.energy, 'fabric'));
    body.position.set(0, -5, 31); head.position.set(0, 25, 32); this.bird.add(body, head);
    for (let i = 0; i < 13; i++) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(3.2, 25 + i % 4 * 5, 5), additiveMaterial(ctx.color.clone().offsetHSL(i % 2 ? 0.03 : -0.02, 0, 0.12), 0.7));
      feather.rotation.z = Math.PI; this.group.add(feather); this.feathers.push(feather);
    }
    for (const side of [-1, 1]) {
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(ctx.origin.x, ctx.origin.y - 82, 8),
        new THREE.Vector3(ctx.origin.x + side * 95, ctx.origin.y - 25, 10),
        new THREE.Vector3(ctx.origin.x + side * 70, ctx.origin.y + 85, 12),
        new THREE.Vector3(ctx.origin.x, ctx.origin.y + 165, 14),
      );
      const path = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 1.5, 6, false), additiveMaterial(ctx.color, 0.3));
      this.group.add(path); this.liftPaths.push(path);
    }
  }

  update(t: number, now: number): void {
    const spread = clamp(cosmicParam(this.ctx.params, ['spread'], 1), 0.55, 2.2);
    const speed = clamp(cosmicParam(this.ctx.params, ['riseSpeed'], 1), 0.45, 2.4);
    const flapRate = clamp(cosmicParam(this.ctx.params, ['wingFlap'], 1), 0.4, 3);
    const rise = easeOut((t - 0.08) / 0.92); const open = 0.24 + Math.min(1, t * 5) * 0.76;
    const flap = Math.sin(now * 0.006 * flapRate) * 0.16;
    this.bird.position.set(this.ctx.origin.x + Math.sin(t * TAU) * 14 * spread, this.ctx.origin.y + rise * 168 * speed, 28);
    this.bird.rotation.z = Math.sin(t * TAU) * 0.08; setObjectOpacity(this.bird, fadeAt(t, 0.8));
    this.leftWing.scale.set(open * spread, 1 + flap, 1); this.rightWing.scale.set(-open * spread, 1 - flap, 1);
    this.leftWing.rotation.z = 0.08 + flap; this.rightWing.rotation.z = -0.08 - flap;
    for (let i = 0; i < this.feathers.length; i++) {
      const phase = i / this.feathers.length; const p = (t * (0.7 + speed * 0.2) + phase * 0.72) % 1;
      const side = i % 2 ? -1 : 1; const wake = 1 - p;
      this.feathers[i].position.set(this.ctx.origin.x + side * (14 + p * 68) * spread + Math.sin(now * 0.003 + i) * 6, this.ctx.origin.y - 48 + p * 185 * speed, 15 + i % 3);
      this.feathers[i].rotation.z = side * (0.22 + p * 0.55); this.feathers[i].scale.setScalar(0.45 + wake * 0.5);
      setOpacity(this.feathers[i], fadeAt(t, 0.82) * Math.sin(p * Math.PI) * 0.65);
    }
    for (const path of this.liftPaths) { path.scale.set(spread, Math.min(1, t * 2.8), 1); setOpacity(path, fadeAt(t, 0.62) * 0.34); }
  }
}

import * as THREE from 'three';
import { additiveMaterial, fadeAt, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, placeCosmicBeam, TAU } from './three-family-cosmic-shared';

const LENS_VERTEX = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const LENS_FRAGMENT = `varying vec2 vUv;uniform vec3 uColor;uniform float uTime;uniform float uFade;void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float ring=pow(max(0.,1.-abs(r-.62)*8.),2.);float swirl=.5+.5*sin(atan(p.y,p.x)*8.-uTime*3.+r*16.);float a=(ring*.58+pow(max(0.,1.-r),3.)*.42)*uFade;gl_FragColor=vec4(uColor*(.5+swirl*.5)*a,a);}`;

export type SingularityParams = {
  pull: number;
  lensing: number;
  horizonSize: number;
  dilation: number;
  jetPower: number;
};

export function resolveSingularityParams(params: Record<string, number>): SingularityParams {
  return {
    pull: clamp(cosmicParam(params, ['gravityPull'], 1), 0.35, 3.5),
    lensing: clamp(cosmicParam(params, ['lensingStrength'], 1), 0.3, 3),
    horizonSize: clamp(cosmicParam(params, ['eventHorizon'], 1), 0.55, 2.4),
    dilation: clamp(cosmicParam(params, ['timeDilation'], 1), 0.25, 1.5),
    jetPower: clamp(cosmicParam(params, ['jetPower'], 1), 0.35, 3.2),
  };
}

/** Black-hole stage: event horizon, inclined accretion ribbons and inward dust. */
export class SingularityCosmicStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly horizon: THREE.Mesh;
  private readonly disk: THREE.Mesh[] = [];
  private readonly dust: THREE.Mesh[] = [];
  private readonly lens: THREE.Mesh;
  private readonly lensMaterial: THREE.ShaderMaterial;
  private readonly settings: SingularityParams;
  private readonly jetSheaths: THREE.Mesh[] = [];
  private readonly jetCores: THREE.Mesh[] = [];
  private readonly jetKnots: THREE.Mesh[] = [];

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; this.settings = resolveSingularityParams(ctx.params); ctx.root.add(this.group);
    this.horizon = new THREE.Mesh(new THREE.SphereGeometry(31 * ctx.energy, 24, 16), new THREE.MeshBasicMaterial({ color: 0x010106, transparent: true, opacity: 0.96, depthWrite: false }));
    this.horizon.position.set(ctx.origin.x, ctx.origin.y, 45); this.group.add(this.horizon);
    const diskCount = Math.max(5, Math.min(11, Math.round(4 + cosmicParam(ctx.params, ['accretionSpin'], 2))));
    for (let i = 0; i < diskCount; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(45 + i * 10, 2.6 - i * 0.12, 10, 72), additiveMaterial(ctx.color.clone().offsetHSL(i * 0.02, 0, 0.14), 0.62 - i * 0.045));
      band.position.set(ctx.origin.x, ctx.origin.y, 24 + i * 1.8); band.rotation.x = 0.72 + i * 0.1; band.rotation.y = 0.18 + i * 0.11; this.group.add(band); this.disk.push(band);
    }
    const dustCount = 24;
    for (let i = 0; i < dustCount; i++) {
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(2 + i % 3, 0), additiveMaterial(ctx.color.clone().offsetHSL((i % 5 - 2) * 0.018, 0, 0.12), 0.7));
      this.group.add(mote); this.dust.push(mote);
    }
    this.lensMaterial = new THREE.ShaderMaterial({ uniforms: { uColor: { value: ctx.color }, uTime: { value: 0 }, uFade: { value: 1 } }, vertexShader: LENS_VERTEX, fragmentShader: LENS_FRAGMENT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.lens = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), this.lensMaterial); this.lens.position.set(ctx.origin.x, ctx.origin.y, 5); this.group.add(this.lens);
    for (const side of [-1, 1]) {
      const sheath = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18, 1, true), new THREE.MeshBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.24, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), additiveMaterial(ctx.color.clone().offsetHSL(0.05, -0.08, 0.26), 0.78));
      this.group.add(sheath, core); this.jetSheaths.push(sheath); this.jetCores.push(core);
      for (let i = 0; i < 6; i++) {
        const knot = new THREE.Mesh(new THREE.SphereGeometry(3 + i % 2, 10, 7), additiveMaterial(ctx.color.clone().offsetHSL((i % 3 - 1) * 0.025, 0, 0.2), 0.82));
        knot.userData.jetSide = side; knot.userData.jetIndex = i; this.group.add(knot); this.jetKnots.push(knot);
      }
    }
  }

  update(t: number, now: number): void {
    const { pull, lensing, horizonSize, dilation, jetPower } = this.settings;
    const fade = fadeAt(t, 0.78); const collapse = 1 + t * 0.18;
    this.horizon.scale.setScalar(horizonSize * collapse); setOpacity(this.horizon, fade * 0.96);
    for (let i = 0; i < this.disk.length; i++) {
      const inward = 1 - t * (0.34 + pull * 0.08); const wobble = Math.sin(now * 0.003 * dilation + i) * 0.035;
      this.disk[i].rotation.z = now * 0.0018 * this.ctx.profile.spin * (i % 2 ? -1 : 1) + wobble;
      this.disk[i].rotation.x = 0.72 + i * 0.1 + Math.sin(now * 0.001 + i) * 0.03;
      this.disk[i].scale.setScalar(inward * (1 + i * 0.055)); setOpacity(this.disk[i], fade * (0.68 - i * 0.045));
    }
    for (let i = 0; i < this.dust.length; i++) {
      const base = i / this.dust.length * TAU + i * 0.4; const radius = (118 - t * 82 * pull) * (0.62 + (i % 7) * 0.065);
      const angle = base + now * 0.0008 * this.ctx.profile.spin * (1 + i % 3 * 0.1); const fall = Math.sin(t * Math.PI) * (10 + i % 4 * 5);
      this.dust[i].position.set(this.ctx.origin.x + Math.cos(angle) * radius, this.ctx.origin.y + Math.sin(angle) * radius * 0.48 + fall, 22 + i % 5 * 3);
      this.dust[i].rotation.set(angle, angle * 0.7, now * 0.002 + i); this.dust[i].scale.setScalar(Math.max(0.05, 1 - t * 0.75)); setOpacity(this.dust[i], fade * (1 - t * 0.4));
    }
    this.lensMaterial.uniforms.uTime.value = now * 0.001 * dilation;
    this.lensMaterial.uniforms.uFade.value = fade * lensing * Math.sin(Math.min(1, t * 2) * Math.PI) * 0.75;
    const ignition = easeOut(t * 3.2); const jetLength = (92 + jetPower * 82) * ignition;
    const tiltX = 13 * Math.sin(now * 0.00045 * dilation);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1; const endX = this.ctx.origin.x + side * tiltX;
      const endY = this.ctx.origin.y + side * jetLength;
      placeCosmicBeam(this.jetSheaths[i], this.ctx.origin.x, this.ctx.origin.y + side * 24, 42, endX, endY, 32, 9 + jetPower * 5.5);
      placeCosmicBeam(this.jetCores[i], this.ctx.origin.x, this.ctx.origin.y + side * 27, 44, endX, endY, 36, 1.8 + jetPower * 1.25);
      const pulse = 0.78 + Math.sin(now * 0.012 * jetPower + i * Math.PI) * 0.18;
      this.jetSheaths[i].scale.x *= pulse; this.jetSheaths[i].scale.z *= pulse;
      setOpacity(this.jetSheaths[i], fade * ignition * (0.12 + jetPower * 0.08));
      setOpacity(this.jetCores[i], fade * ignition * (0.48 + jetPower * 0.12));
    }
    for (let i = 0; i < this.jetKnots.length; i++) {
      const side = Number(this.jetKnots[i].userData.jetSide); const index = Number(this.jetKnots[i].userData.jetIndex);
      const phase = (t * (0.9 + jetPower * 0.28) + index / 6) % 1;
      const distance = 30 + phase * Math.max(1, jetLength - 30);
      const wobble = Math.sin(now * 0.006 * jetPower + index * 1.7) * (2 + phase * 5);
      this.jetKnots[i].position.set(this.ctx.origin.x + side * tiltX * phase + wobble, this.ctx.origin.y + side * distance, 38 + Math.cos(index * 1.9) * 4);
      this.jetKnots[i].scale.setScalar((0.45 + (1 - phase) * 0.7) * jetPower);
      setOpacity(this.jetKnots[i], fade * ignition * Math.sin(phase * Math.PI) * 0.8);
    }
  }
}

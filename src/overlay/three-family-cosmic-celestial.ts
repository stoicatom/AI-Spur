import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, type FamilyContext, type FamilyLayer, setOpacity } from './three-family-shared';
import { clamp, cosmicParam, easeOut, setObjectOpacity, TAU } from './three-family-cosmic-shared';

/** Ninja-star blades spin through orbital afterimages and sparks. */
export class OrbitCosmicStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly star = new THREE.Group();
  private readonly afterimages: THREE.Mesh[] = [];
  private readonly sparks: THREE.Mesh[] = [];

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.star);
    const bladeMaterial = physicalMaterial(ctx.color, ctx.energy);
    const hub = new THREE.Mesh(new THREE.OctahedronGeometry(16 * ctx.energy, 1), bladeMaterial); this.star.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(9, 78, 4), physicalMaterial(ctx.color.clone().offsetHSL(i * 0.02, 0, 0.1), ctx.energy));
      blade.position.y = 46; blade.rotation.z = Math.PI; this.star.add(blade);
      const ghost = new THREE.Mesh(new THREE.ConeGeometry(8, 70, 4), additiveMaterial(ctx.color, 0.25));
      ghost.position.set(ctx.origin.x, ctx.origin.y, 22); this.group.add(ghost); this.afterimages.push(ghost);
    }
    const sparkCount = Math.max(12, Math.min(32, Math.round(12 + cosmicParam(ctx.params, ['orbits'], 1) * 5)));
    for (let i = 0; i < sparkCount; i++) {
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(2.5 + i % 3, 0), additiveMaterial(ctx.color.clone().offsetHSL((i % 3 - 1) * 0.025, 0, 0.18), 0.78));
      this.group.add(spark); this.sparks.push(spark);
    }
  }

  update(t: number, now: number): void {
    const speed = clamp(cosmicParam(this.ctx.params, ['orbits', 'spin'], 1), 0.35, 4);
    const radiusScale = clamp(cosmicParam(this.ctx.params, ['radius'], 1), 0.45, 2.5);
    const reveal = 0.35 + easeOut(t * 3) * 0.65; const fade = fadeAt(t, 0.78);
    this.star.position.set(this.ctx.origin.x, this.ctx.origin.y, 34); this.star.rotation.z = now * 0.0022 * speed; this.star.rotation.x = Math.sin(now * 0.0012) * 0.12;
    this.star.scale.setScalar(reveal); setObjectOpacity(this.star, fade);
    for (let i = 0; i < this.afterimages.length; i++) {
      const angle = now * 0.0022 * speed + i * TAU / this.afterimages.length; const radius = (40 + i * 12) * radiusScale;
      this.afterimages[i].position.set(this.ctx.origin.x + Math.cos(angle) * radius, this.ctx.origin.y + Math.sin(angle) * radius * 0.58, 20 + i);
      this.afterimages[i].rotation.z = angle + Math.PI / 2; this.afterimages[i].scale.set(0.65 + reveal * 0.3, reveal, 1); setOpacity(this.afterimages[i], fade * 0.22);
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const angle = now * 0.0015 * speed * (i % 2 ? -1 : 1) + i * 2.399963; const radius = (32 + i % 7 * 10) * radiusScale * reveal;
      this.sparks[i].position.set(this.ctx.origin.x + Math.cos(angle) * radius, this.ctx.origin.y + Math.sin(angle) * radius * 0.64, 28 + i % 4 * 3);
      this.sparks[i].rotation.set(angle, now * 0.003 + i, -angle); this.sparks[i].scale.setScalar(0.4 + Math.abs(Math.sin(now * 0.008 + i)) * 0.7); setOpacity(this.sparks[i], fade * 0.74);
    }
  }
}

const HEAT_VERTEX = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const HEAT_FRAGMENT = `varying vec2 vUv;uniform vec3 uColor;uniform float uTime;uniform float uFade;void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float ripple=.5+.5*sin(r*34.-uTime*5.);float edge=smoothstep(1.,.28,r)*smoothstep(.18,.42,r);float a=edge*(.08+ripple*.11)*uFade;gl_FragColor=vec4(uColor*(.65+ripple*.55),a);}`;

/** Solar glow has a granular body, rotating corona blades and one heat field. */
export class SolarGlowStage implements FamilyLayer {
  private readonly ctx: FamilyContext;
  private readonly group = new THREE.Group();
  private readonly sun = new THREE.Group();
  private readonly corona: THREE.Mesh[] = [];
  private readonly heatMaterial: THREE.ShaderMaterial;
  private readonly heatField: THREE.Mesh;

  constructor(ctx: FamilyContext) {
    this.ctx = ctx; ctx.root.add(this.group); this.group.add(this.sun);
    const surface = new THREE.Mesh(new THREE.IcosahedronGeometry(34 * ctx.energy, 3), physicalMaterial(ctx.color.clone().offsetHSL(0, 0, 0.12), ctx.energy * 1.35));
    const grid = new THREE.Mesh(new THREE.IcosahedronGeometry(36 * ctx.energy, 2), new THREE.MeshBasicMaterial({ color: ctx.color, transparent: true, opacity: 0.42, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sun.add(surface, grid);
    for (let i = 0; i < 20; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(4 + i % 3, 24 + i % 5 * 5, 5), additiveMaterial(ctx.color.clone().offsetHSL(i % 2 ? 0.02 : -0.015, 0, 0.18), 0.62));
      const angle = i / 20 * TAU; blade.position.set(Math.cos(angle) * 50, Math.sin(angle) * 50, -2 + i % 3); blade.rotation.z = angle - Math.PI / 2;
      this.sun.add(blade); this.corona.push(blade);
    }
    this.heatMaterial = new THREE.ShaderMaterial({ uniforms: { uColor: { value: ctx.color }, uTime: { value: 0 }, uFade: { value: 1 } }, vertexShader: HEAT_VERTEX, fragmentShader: HEAT_FRAGMENT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.heatField = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), this.heatMaterial);
    this.heatField.position.set(ctx.origin.x, ctx.origin.y, 8); this.group.add(this.heatField);
  }

  update(t: number, now: number): void {
    const radiance = clamp(cosmicParam(this.ctx.params, ['radiance', 'intensity'], 1), 0.45, 3);
    const heat = clamp(cosmicParam(this.ctx.params, ['heatWaves'], 1), 0.3, 3);
    const bloom = clamp(cosmicParam(this.ctx.params, ['bloom'], 1), 0.45, 3);
    const reveal = easeOut(t * 3.5); const pulse = 1 + Math.sin(now * 0.008 * heat) * 0.035 * radiance;
    this.sun.position.set(this.ctx.origin.x, this.ctx.origin.y + t * 18, 30); this.sun.rotation.z = now * 0.00035 * radiance;
    this.sun.scale.setScalar((0.55 + reveal * 0.45) * pulse); setObjectOpacity(this.sun, fadeAt(t, 0.68));
    for (let i = 0; i < this.corona.length; i++) {
      const flare = 0.72 + Math.sin(now * 0.009 * heat + i * 1.7) * 0.22;
      this.corona[i].scale.set(0.75 + bloom * 0.12, flare * (0.8 + radiance * 0.18), 1);
      setOpacity(this.corona[i], fadeAt(t, 0.7) * (0.46 + flare * 0.2));
    }
    this.heatField.position.set(this.ctx.origin.x, this.ctx.origin.y + t * 18, 8);
    this.heatField.scale.setScalar(0.7 + reveal * 0.22 * bloom);
    this.heatMaterial.uniforms.uTime.value = now * 0.001 * heat; this.heatMaterial.uniforms.uFade.value = fadeAt(t, 0.62) * reveal;
  }
}

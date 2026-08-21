import * as THREE from 'three';
import { additiveMaterial, fadeAt, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type EnergySeed = { angle: number; phase: number; reach: number; size: number };

const FIELD_VERTEX = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const FIELD_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform vec2 uResolution,uOrigin,uDirection;
uniform vec3 uColor,uAccent;
uniform float uTime,uProgress,uFade,uFlash,uMode,uReach;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 delta=(vUv-uOrigin)*uResolution;
  float radius=length(delta), angle=atan(delta.y,delta.x);
  float unit=max(1.,min(uResolution.x,uResolution.y));
  float wave=exp(-pow((radius-uProgress*uReach)/max(5.,uReach*.026),2.));
  float rays=pow(max(0.,sin(angle*12.-uTime*3.)),18.)*smoothstep(.02,.32,uProgress);
  float pattern=0.;
  if(uMode<.5){pattern=.5+.5*sin(delta.x*.018+delta.y*.006-uTime*4.+sin(delta.y*.012));}
  else if(uMode<1.5){pattern=rays*(.45+.55*sin(radius*.055-uTime*12.));}
  else if(uMode<2.5){pattern=.5+.5*sin(radius*.045-uTime*8.);}
  else if(uMode<3.5){
    vec2 starGrid=vUv*uResolution/26.;
    float star=(1.-smoothstep(.04,.19,length(fract(starGrid)-.5)))*step(.93,hash21(floor(starGrid)));
    pattern=star+rays*.38;
  }
  else{pattern=max(rays*.72,.5+.5*sin(angle*8.+radius*.035-uTime*7.));}
  float center=exp(-radius/max(30.,unit*.3))*uFlash;
  float veil=(.012+.026*pattern)*smoothstep(0.,.12,uProgress);
  float alpha=(center*.38+wave*.16+pattern*.055+veil)*uFade;
  if(alpha<.002)discard;
  vec3 tint=mix(uColor,uAccent,clamp(pattern*.7+wave*.25,0.,1.));
  gl_FragColor=vec4(tint*(.72+center*2.8+wave*1.5),alpha);
}`;

export function farthestViewportCorner(
  origin: THREE.Vector3, width: number, height: number,
): number {
  const halfWidth = width / 2; const halfHeight = height / 2;
  return Math.max(
    Math.hypot(origin.x + halfWidth, origin.y + halfHeight),
    Math.hypot(origin.x - halfWidth, origin.y + halfHeight),
    Math.hypot(origin.x + halfWidth, origin.y - halfHeight),
    Math.hypot(origin.x - halfWidth, origin.y - halfHeight),
  );
}

function familyMode(family: FamilyContext['profile']['family']): number {
  return { natural: 0, weapon: 1, rhythm: 2, cosmic: 3, impact: 4 }[family];
}

function energyGeometry(family: FamilyContext['profile']['family']): THREE.BufferGeometry {
  switch (family) {
    case 'natural': return new THREE.ConeGeometry(1.4, 14, 5);
    case 'weapon': return new THREE.TetrahedronGeometry(4.2, 0);
    case 'rhythm': return new THREE.TorusGeometry(3.2, 0.9, 5, 12);
    case 'cosmic': return new THREE.OctahedronGeometry(3.8, 0);
    case 'impact': return new THREE.DodecahedronGeometry(4.4, 0);
  }
}

/** A transparent, family-shaped energy stage that reaches every viewport edge. */
export class FullFieldSpectacleLayer implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly fieldMaterial: THREE.ShaderMaterial;
  private readonly field: THREE.Mesh;
  private readonly rings: THREE.Mesh[] = [];
  private readonly energy: THREE.InstancedMesh;
  private readonly seeds: EnergySeed[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private width: number;
  private height: number;
  private reach: number;

  constructor(private readonly ctx: FamilyContext) {
    this.width = ctx.width; this.height = ctx.height;
    this.reach = farthestViewportCorner(ctx.origin, ctx.width, ctx.height) * 1.035;
    ctx.root.add(this.group);
    const accent = ctx.color.clone().offsetHSL(
      ctx.profile.family === 'natural' ? 0.06 : -0.035, -0.08, 0.2,
    );
    this.fieldMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(ctx.width, ctx.height) },
        uOrigin: { value: new THREE.Vector2() }, uDirection: { value: ctx.direction.clone() },
        uColor: { value: ctx.color }, uAccent: { value: accent }, uTime: { value: 0 },
        uProgress: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 },
        uMode: { value: familyMode(ctx.profile.family) }, uReach: { value: this.reach },
      },
      vertexShader: FIELD_VERTEX, fragmentShader: FIELD_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    this.field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fieldMaterial);
    this.field.name = 'full-field-atmosphere'; this.field.position.z = -70; this.group.add(this.field);
    this.createRings();
    const count = { natural: 64, weapon: 58, rhythm: 48, cosmic: 72, impact: 68 }[ctx.profile.family];
    this.energy = new THREE.InstancedMesh(
      energyGeometry(ctx.profile.family), additiveMaterial(accent, 0.76), count,
    );
    this.energy.name = `full-field-${ctx.profile.family}-energy`;
    this.energy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.energy.frustumCulled = false; this.group.add(this.energy);
    for (let i = 0; i < count; i++) this.seeds.push({
      angle: i * GOLDEN_ANGLE + familyMode(ctx.profile.family) * 0.19,
      phase: (i * 0.754877666) % 1,
      reach: 0.38 + ((i * 0.569840296) % 1) * 0.62,
      size: 0.58 + (i % 7) * 0.11,
    });
    this.resize(ctx.width, ctx.height);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.reach = farthestViewportCorner(this.ctx.origin, this.width, this.height) * 1.035;
    this.field.scale.set(this.width, this.height, 1);
    this.fieldMaterial.uniforms.uResolution.value.set(this.width, this.height);
    this.fieldMaterial.uniforms.uOrigin.value.set(
      this.ctx.origin.x / this.width + 0.5, this.ctx.origin.y / this.height + 0.5,
    );
    this.fieldMaterial.uniforms.uReach.value = this.reach;
  }

  update(t: number, now: number): void {
    const intro = Math.min(1, t / 0.045); const fade = fadeAt(t, 0.73) * intro;
    const progress = 1 - Math.pow(1 - Math.min(1, t / 0.76), 3);
    this.fieldMaterial.uniforms.uTime.value = now * 0.001;
    this.fieldMaterial.uniforms.uProgress.value = progress;
    this.fieldMaterial.uniforms.uFade.value = fade;
    this.fieldMaterial.uniforms.uFlash.value = Math.exp(-t * 13) * (0.8 + this.ctx.energy * 0.22);
    this.updateRings(t, fade);
    this.updateEnergy(t, now, fade);
  }

  private createRings(): void {
    const segments = this.ctx.profile.family === 'weapon' ? 8 : 96;
    const innerRadius = this.ctx.profile.family === 'impact' ? 0.97 : 0.982;
    const geometry = new THREE.RingGeometry(innerRadius, 1, segments);
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: this.ctx.color.clone().offsetHSL(i * 0.012, 0, 0.12), transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.name = `full-field-shock-ring-${i}`; ring.position.copy(this.ctx.origin); ring.position.z = 18 + i;
      ring.rotation.z = Math.atan2(this.ctx.direction.y, this.ctx.direction.x) + i * 0.13;
      this.group.add(ring); this.rings.push(ring);
    }
  }

  private updateRings(t: number, fade: number): void {
    const force = this.ctx.profile.family === 'impact' ? 0.38 : 0.3;
    for (let i = 0; i < this.rings.length; i++) {
      const local = Math.max(0, Math.min(1, (t - i * 0.045) / (0.66 + i * 0.045)));
      const progress = 1 - Math.pow(1 - local, 3);
      this.rings[i].scale.setScalar(Math.max(0.001, this.reach * progress));
      setOpacity(this.rings[i], fade * Math.sin(Math.PI * local) * (force - i * 0.055));
    }
  }

  private updateEnergy(t: number, now: number, fade: number): void {
    const family = this.ctx.profile.family; const directionAngle = Math.atan2(this.ctx.direction.y, this.ctx.direction.x);
    for (let i = 0; i < this.seeds.length; i++) {
      const seed = this.seeds[i]; const local = Math.max(0, Math.min(1, (t - seed.phase * 0.11) / 0.72));
      const progress = 1 - Math.pow(1 - local, 3); let angle = seed.angle;
      if (family === 'weapon') angle = directionAngle + (i % 2 ? Math.PI : 0) + Math.sin(seed.angle) * 0.62;
      else if (family === 'cosmic') angle += (1 - progress) * 2.2 + now * 0.00018;
      else if (family === 'natural') angle += Math.sin(now * 0.0014 + seed.phase * TAU) * 0.18;
      const radius = this.reach * seed.reach * progress;
      const drift = family === 'natural' ? Math.sin(now * 0.002 + i) * 28 * progress : 0;
      this.position.set(
        this.ctx.origin.x + Math.cos(angle) * radius + this.ctx.direction.x * drift,
        this.ctx.origin.y + Math.sin(angle) * radius + this.ctx.direction.y * drift,
        28 + (i % 9) * 3 - progress * 8,
      );
      this.euler.set(progress * seed.phase * 4, now * 0.002 + seed.angle, angle - Math.PI / 2);
      this.quaternion.setFromEuler(this.euler);
      const pulse = 0.74 + Math.abs(Math.sin(now * 0.007 + seed.phase * TAU)) * 0.5;
      if (family === 'weapon') this.scale.set(seed.size * 0.55, seed.size * (5 + progress * 7), seed.size * 0.7);
      else if (family === 'natural') this.scale.set(seed.size, seed.size * (2.8 + progress * 2.2), seed.size);
      else this.scale.setScalar(seed.size * pulse * (0.45 + progress * 0.9));
      this.matrix.compose(this.position, this.quaternion, this.scale); this.energy.setMatrixAt(i, this.matrix);
    }
    this.energy.instanceMatrix.needsUpdate = true;
    setOpacity(this.energy, fade * (0.62 + this.ctx.energy * 0.08));
  }
}

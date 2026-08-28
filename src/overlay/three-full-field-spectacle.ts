import * as THREE from 'three';
import { additiveMaterial, fadeAt, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { resolveMaterialPhysics } from './three-effect-physics';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type EnergySeed = { angle: number; phase: number; reach: number; size: number };

const FIELD_VERTEX = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const FIELD_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform vec2 uResolution,uOrigin,uDirection;
uniform vec3 uColor,uAccent;
uniform float uTime,uProgress,uFade,uFlash,uMode,uReach,uPhase,uLocalRadius;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 delta=(vUv-uOrigin)*uResolution;
  float radius=length(delta), angle=atan(delta.y,delta.x);
  float unit=max(1.,min(uResolution.x,uResolution.y));
  float wave=exp(-pow((radius-uProgress*uReach)/max(5.,uReach*.026),2.));
  float rays=pow(max(0.,sin(angle*12.-uTime*3.+uPhase)),18.)*smoothstep(.02,.32,uProgress);
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
  float localMask=uLocalRadius>0. ? 1.-smoothstep(uLocalRadius*.72,uLocalRadius,radius) : 1.;
  float alpha=(center*.38+wave*.16+pattern*.055+veil)*uFade*localMask;
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

function forceMode(force: NonNullable<FamilyContext['physics']>['force']): number {
  return { fluid: 0, vortex: 0, elastic: 1, fracture: 1, ballistic: 1, recoil: 1,
    resonance: 2, gravity: 3, thrust: 3, combustion: 4, electro: 4 }[force];
}

function energyGeometry(surface: NonNullable<FamilyContext['physics']>['surface']): THREE.BufferGeometry {
  switch (surface) {
    case 'water': return new THREE.SphereGeometry(3.2, 7, 5);
    case 'fire': return new THREE.ConeGeometry(2.4, 13, 5);
    case 'air': return new THREE.TorusGeometry(3.1, .65, 5, 12);
    case 'wood': case 'bone': return new THREE.CapsuleGeometry(1.8, 8, 3, 6);
    case 'glass': case 'ice': return new THREE.TetrahedronGeometry(4.2, 0);
    case 'fabric': case 'plastic': return new THREE.PlaneGeometry(7, 3);
    case 'metal': return new THREE.OctahedronGeometry(3.8, 0);
    case 'stone': return new THREE.DodecahedronGeometry(4.4, 0);
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
  private readonly physics: NonNullable<FamilyContext['physics']>;
  private readonly localized: boolean;

  constructor(private readonly ctx: FamilyContext) {
    this.physics = ctx.physics ?? resolveMaterialPhysics(ctx.profile, ctx.params, 1);
    this.localized = ctx.packId === 'dragon' || ctx.packId === 'revolver';
    this.width = ctx.width; this.height = ctx.height;
    this.reach = this.localized ? Math.min(360, farthestViewportCorner(ctx.origin, ctx.width, ctx.height)) : farthestViewportCorner(ctx.origin, ctx.width, ctx.height) * 1.035;
    ctx.root.add(this.group);
    const accent = ctx.color.clone().offsetHSL(
      this.physics.surface === 'fire' ? .06 : -.035, -0.08, 0.2,
    );
    this.fieldMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(ctx.width, ctx.height) },
        uOrigin: { value: new THREE.Vector2() }, uDirection: { value: ctx.direction.clone() },
        uColor: { value: ctx.color }, uAccent: { value: accent }, uTime: { value: 0 },
        uProgress: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 },
        uMode: { value: forceMode(this.physics.force) }, uReach: { value: this.reach },
        uLocalRadius: { value: this.localized ? 330 : 0 },
        uPhase: { value: this.physics.identityPhase },
      },
      vertexShader: FIELD_VERTEX, fragmentShader: FIELD_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    this.field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fieldMaterial);
    this.field.name = 'full-field-atmosphere'; this.field.position.z = -70; this.group.add(this.field);
    this.createRings();
    const count = Math.round(Math.max(44, Math.min(84, 70 - this.physics.mass * 3 + this.physics.stiffness * 5)));
    this.energy = new THREE.InstancedMesh(
      energyGeometry(this.physics.surface), additiveMaterial(accent, 0.76), count,
    );
    this.energy.name = `full-field-${ctx.packId ?? ctx.profile.family}-energy`;
    this.energy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.energy.frustumCulled = false; this.group.add(this.energy);
    for (let i = 0; i < count; i++) this.seeds.push({
      angle: i * GOLDEN_ANGLE + this.physics.identityPhase,
      phase: (i * 0.754877666 + this.physics.identityPhase / TAU) % 1,
      reach: 0.34 + ((i * 0.569840296 + this.physics.restitution) % 1) * 0.66,
      size: (0.5 + (i % 7) * 0.1) * (0.8 + this.physics.mass * .06),
    });
    this.resize(ctx.width, ctx.height);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.reach = this.localized ? Math.min(360, farthestViewportCorner(this.ctx.origin, this.width, this.height)) : farthestViewportCorner(this.ctx.origin, this.width, this.height) * 1.035;
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
    this.fieldMaterial.uniforms.uFade.value = this.localized ? fade * 0.08 : fade;
    this.fieldMaterial.uniforms.uFlash.value = this.localized ? 0 : Math.exp(-t * 13) * (0.8 + this.ctx.energy * 0.22);
    this.updateRings(t, fade);
    this.updateEnergy(t, now, fade);
  }

  private createRings(): void {
    const segments = ['metal', 'glass', 'ice', 'stone'].includes(this.physics.surface) ? 12 : 96;
    const innerRadius = .965 + this.physics.restitution * .02;
    const geometry = new THREE.RingGeometry(innerRadius, 1, segments);
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: this.ctx.color.clone().offsetHSL(i * 0.012, 0, 0.12), transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.name = `full-field-shock-ring-${i}`; ring.position.copy(this.ctx.origin); ring.position.z = 18 + i;
      ring.rotation.z = Math.atan2(this.ctx.direction.y, this.ctx.direction.x)
        + this.physics.identityPhase + i * (.08 + this.physics.friction * .12);
      this.group.add(ring); this.rings.push(ring);
    }
  }

  private updateRings(t: number, fade: number): void {
    const force = .24 + this.physics.stiffness * .045;
    for (let i = 0; i < this.rings.length; i++) {
      const local = Math.max(0, Math.min(1, (t - i * .045) / (.58 + this.physics.mass * .025 + i * .045)));
      const progress = 1 - Math.pow(1 - local, 3);
      this.rings[i].scale.setScalar(Math.max(0.001, this.reach * progress));
      setOpacity(this.rings[i], fade * Math.sin(Math.PI * local) * (force - i * 0.055) * (this.localized ? 0.12 : 1));
    }
  }

  private updateEnergy(t: number, now: number, fade: number): void {
    const force = this.physics.force; const surface = this.physics.surface;
    const directionAngle = Math.atan2(this.ctx.direction.y, this.ctx.direction.x);
    for (let i = 0; i < this.seeds.length; i++) {
      const seed = this.seeds[i]; const local = Math.max(0, Math.min(1, (t - seed.phase * 0.11) / 0.72));
      const progress = 1 - Math.pow(1 - local, 3); let angle = seed.angle;
      if (['ballistic', 'recoil', 'fracture'].includes(force)) angle = directionAngle + (i % 2 ? Math.PI : 0) + Math.sin(seed.angle) * .62;
      else if (force === 'gravity' || force === 'thrust') angle += (1 - progress) * this.physics.stiffness + now * .00018;
      else if (force === 'vortex' || force === 'fluid') angle += Math.sin(now * .0014 + seed.phase * TAU) * (.12 + this.physics.resonance * .08);
      const radius = this.reach * seed.reach * progress;
      const drift = (force === 'fluid' || force === 'vortex') ? Math.sin(now * .002 + i) * 24 * this.physics.stiffness * progress : 0;
      this.position.set(
        this.ctx.origin.x + Math.cos(angle) * radius + this.ctx.direction.x * drift,
        this.ctx.origin.y + Math.sin(angle) * radius + this.ctx.direction.y * drift,
        28 + (i % 9) * 3 - progress * 8,
      );
      this.euler.set(progress * seed.phase * 4, now * 0.002 + seed.angle, angle - Math.PI / 2);
      this.quaternion.setFromEuler(this.euler);
      const pulse = 0.74 + Math.abs(Math.sin(now * 0.007 + seed.phase * TAU)) * 0.5;
      if (['ballistic', 'recoil', 'fracture'].includes(force)) this.scale.set(seed.size * .55, seed.size * (4 + progress * 7 * this.physics.impulse), seed.size * .7);
      else if (surface === 'water' || surface === 'fire' || surface === 'air') this.scale.set(seed.size, seed.size * (2.2 + progress * 2.2 / Math.sqrt(this.physics.mass)), seed.size);
      else this.scale.setScalar(seed.size * pulse * (0.45 + progress * 0.9));
      this.matrix.compose(this.position, this.quaternion, this.scale); this.energy.setMatrixAt(i, this.matrix);
    }
    this.energy.instanceMatrix.needsUpdate = true;
    setOpacity(this.energy, fade * (this.localized ? 0.16 : 0.62 + this.ctx.energy * 0.08));
  }
}

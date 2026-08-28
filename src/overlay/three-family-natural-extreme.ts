import * as THREE from 'three';
import { additiveMaterial, fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, shiftedColor } from './three-family-natural-shared';

const GOLDEN_PHASE = 0.61803398875;

type FieldSeed = { phase: number; offset: number; radius: number; scale: number; speed: number };

/** Long-lived full-field tornado, downpour and wildfire simulations. */
export class ExtremeNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly flames: THREE.Mesh[] = [];
  private readonly flameBaseX: number[] = [];
  private tornadoDebris: THREE.InstancedMesh | null = null;
  private wildfireSmoke: THREE.InstancedMesh | null = null;
  private wildfireEmbers: THREE.InstancedMesh | null = null;
  private readonly debrisSeeds: FieldSeed[] = [];
  private readonly smokeSeeds: FieldSeed[] = [];
  private readonly emberSeeds: FieldSeed[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();

  constructor(private readonly ctx: FamilyContext) {
    ctx.root.add(this.group);
    if (ctx.profile.motion === 'tornado') this.createTornado();
    else this.createWildfire();
  }

  update(t: number, now: number): void {
    const fade = fadeAt(t, 0.72);
    if (this.ctx.profile.motion === 'tornado') this.updateTornado(t, now, fade);
    else this.updateWildfire(t, now, fade);
  }

  private createTornado(): void {
    const turns = Math.round(clamp(this.ctx.params.funnelTurns ?? 5, 4, 10));
    const width = clamp(this.ctx.params.funnelWidth ?? 1, 0.65, 1.8);
    for (let i = 0; i < turns; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry((18 + i * 7) * width, 2.2 + this.ctx.energy * 0.5, 8, 42), additiveMaterial(shiftedColor(this.ctx.color, i * 0.006, i * 0.012), 0.62 - i * 0.035));
      ring.position.set(this.ctx.origin.x, this.ctx.origin.y - 64 + i * 18, 12 + i * 2); ring.rotation.x = 1.08; ring.scale.y = 0.45 + i * 0.06;
      this.group.add(ring); this.rings.push(ring);
    }
    const debrisOrbit = clamp(this.ctx.params.debrisOrbit ?? 1, 0.4, 3);
    const count = Math.round(clamp(10 + debrisOrbit * 8 + this.ctx.energy * 2, 12, 38));
    this.tornadoDebris = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(4.2, 0),
      physicalMaterial(shiftedColor(this.ctx.color, -0.04, -0.16), this.ctx.energy, 'rock'),
      count,
    );
    this.tornadoDebris.name = 'tornado-debris-field';
    this.tornadoDebris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.tornadoDebris);
    for (let i = 0; i < count; i++) this.debrisSeeds.push({
      phase: (i * GOLDEN_PHASE % 1) * Math.PI * 2,
      offset: (i * 0.173) % 1,
      radius: 26 + i % 7 * 9,
      scale: 0.45 + i % 5 * 0.16,
      speed: 0.72 + i % 6 * 0.11,
    });
  }

  private createWildfire(): void {
    const spread = clamp(this.ctx.params.spread ?? 1, 0.7, 2.2);
    const count = Math.round(clamp(7 + spread * 2, 6, 14));
    for (let i = 0; i < count; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(10 + i % 3 * 3, 48 + i % 4 * 12, 9), additiveMaterial(shiftedColor(this.ctx.color, i % 3 * 0.018, i % 2 * 0.08), 0.72));
      flame.position.set(this.ctx.origin.x + (i - (count - 1) / 2) * 19 * spread, this.ctx.origin.y - 22 - i % 3 * 3, 16 + i % 4 * 3);
      flame.rotation.z = (i - (count - 1) / 2) * 0.06; flame.scale.set(0.72 + this.ctx.energy * 0.12, 0.8 + i % 4 * 0.11, 0.72);
      this.group.add(flame); this.flames.push(flame); this.flameBaseX.push(flame.position.x);
    }
    for (let i = 0; i < 3; i++) {
      const heat = new THREE.Mesh(new THREE.SphereGeometry(58 + i * 18, 16, 8), additiveMaterial(this.ctx.color, 0.08));
      heat.position.set(this.ctx.origin.x + (i - 1) * 35, this.ctx.origin.y - 38, 2); heat.scale.y = 0.55; this.group.add(heat); this.rings.push(heat);
    }
    const smokeRise = clamp(this.ctx.params.smokeRise ?? 1, 0.35, 3);
    const smokeCount = Math.round(clamp(9 + smokeRise * 7 + spread * 2, 12, 34));
    this.wildfireSmoke = new THREE.InstancedMesh(
      new THREE.SphereGeometry(8, 11, 7),
      new THREE.MeshBasicMaterial({ color: shiftedColor(this.ctx.color, -0.05, -0.3), transparent: true, opacity: 0.18, depthWrite: false }),
      smokeCount,
    );
    this.wildfireSmoke.name = 'wildfire-smoke-field';
    this.wildfireSmoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.wildfireSmoke);
    for (let i = 0; i < smokeCount; i++) this.smokeSeeds.push({
      phase: (i * GOLDEN_PHASE % 1) * Math.PI * 2,
      offset: (i * 0.137) % 1,
      radius: (i % 7 - 3) * 13 * spread,
      scale: 0.65 + i % 4 * 0.16,
      speed: 0.72 + i % 5 * 0.1,
    });
    const emberLift = clamp(this.ctx.params.emberLift ?? 1, 0.4, 3);
    const emberCount = Math.round(clamp(10 + emberLift * 8, 12, 34));
    this.wildfireEmbers = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(2.4, 0), additiveMaterial(shiftedColor(this.ctx.color, 0.06, 0.2), 0.82), emberCount,
    );
    this.wildfireEmbers.name = 'wildfire-ember-field';
    this.wildfireEmbers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.wildfireEmbers);
    for (let i = 0; i < emberCount; i++) this.emberSeeds.push({
      phase: (i * GOLDEN_PHASE % 1) * Math.PI * 2,
      offset: (i * 0.191) % 1,
      radius: (i % 9 - 4) * 10 * spread,
      scale: 0.45 + i % 4 * 0.18,
      speed: 0.75 + i % 6 * 0.1,
    });
  }


  private updateTornado(t: number, now: number, fade: number): void {
    const suction = clamp(this.ctx.params.suction ?? 1, 0.5, 3); const storm = clamp(this.ctx.params.stormScale ?? 1, 0.6, 2.5);
    const drift = clamp(this.ctx.params.lateralDrift ?? 0.4, 0, 2); const debrisOrbit = clamp(this.ctx.params.debrisOrbit ?? 1, 0.4, 3);
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i]; const spin = now * 0.002 * (i % 2 ? -1 : 1) * this.ctx.profile.spin;
      ring.position.x = this.ctx.origin.x + Math.sin(now * 0.0013 + i * 0.31) * drift * 26;
      ring.rotation.z = spin; ring.rotation.y = Math.sin(now * 0.003 + i) * 0.18;
      ring.scale.x = (0.55 + t * 0.7 * storm) * (1 - i * 0.035); ring.scale.y = 0.42 + suction * 0.09;
      setOpacity(ring, fade * (0.62 - i * 0.04));
    }
    if (!this.tornadoDebris) return;
    for (let i = 0; i < this.debrisSeeds.length; i++) {
      const seed = this.debrisSeeds[i]; const lift = (t * (0.42 + suction * 0.14) + seed.offset) % 1;
      const angle = seed.phase + now * 0.003 * debrisOrbit * seed.speed * this.ctx.profile.spin;
      const radius = seed.radius * storm * (1 - lift * Math.min(0.58, suction * 0.2));
      const centerX = this.ctx.origin.x + Math.sin(now * 0.0013 + lift * 2.2) * drift * 26;
      this.position.set(centerX + Math.cos(angle) * radius, this.ctx.origin.y - 72 + lift * 184, 12 + Math.sin(angle) * radius * 0.28);
      this.euler.set(angle * 0.7, now * 0.002 * debrisOrbit * seed.speed, angle); this.quaternion.setFromEuler(this.euler);
      this.scale.set(seed.scale * (1 - lift * 0.28), seed.scale * (0.7 + lift * 0.4), seed.scale);
      this.matrix.compose(this.position, this.quaternion, this.scale); this.tornadoDebris.setMatrixAt(i, this.matrix);
    }
    this.tornadoDebris.instanceMatrix.needsUpdate = true; setOpacity(this.tornadoDebris, fade * 0.82);
  }

  private updateWildfire(t: number, now: number, fade: number): void {
    const heatWarp = clamp(this.ctx.params.heatWarp ?? 1, 0.5, 2.8); const gust = clamp(this.ctx.params.gustResponse ?? 1, 0.5, 2.8);
    const lift = clamp(this.ctx.params.emberLift ?? 1, 0.5, 2.8); const height = clamp(this.ctx.params.flameHeight ?? 1, 0.5, 2.8);
    const smokeRise = clamp(this.ctx.params.smokeRise ?? 1, 0.35, 3);
    for (let i = 0; i < this.flames.length; i++) {
      const flame = this.flames[i]; const flicker = Math.sin(now * 0.016 * heatWarp + i * 1.7);
      flame.scale.y = (0.62 + Math.abs(flicker) * 0.46 * lift) * height * (1 - t * 0.18);
      flame.position.x = this.flameBaseX[i] + flicker * 3.4 * gust; flame.rotation.z = (i - (this.flames.length - 1) / 2) * 0.06 + flicker * 0.08;
      setOpacity(flame, fade * (0.68 + Math.abs(flicker) * 0.2));
    }
    for (let i = 0; i < this.rings.length; i++) { const heat = this.rings[i]; heat.scale.x = 1 + Math.sin(now * 0.006 + i) * 0.14; heat.scale.y = 0.5 + Math.sin(now * 0.009 + i) * 0.08; setOpacity(heat, fade * 0.1); }
    if (this.wildfireSmoke) {
      for (let i = 0; i < this.smokeSeeds.length; i++) {
        const seed = this.smokeSeeds[i]; const p = (t * (0.3 + smokeRise * 0.2) * seed.speed + seed.offset) % 1;
        const sway = Math.sin(seed.phase + now * 0.0015 * gust + p * Math.PI * 2) * (9 + p * 22 * gust);
        this.position.set(this.ctx.origin.x + seed.radius * (1 - p * 0.35) + sway, this.ctx.origin.y - 18 - p * (92 + smokeRise * 82), 16 + p * 28);
        this.quaternion.identity(); const plumeScale = seed.scale * (0.5 + p * (1.35 + smokeRise * 0.28));
        this.scale.set(plumeScale * (1 + p * 0.35), plumeScale, plumeScale * 0.58);
        this.matrix.compose(this.position, this.quaternion, this.scale); this.wildfireSmoke.setMatrixAt(i, this.matrix);
      }
      this.wildfireSmoke.instanceMatrix.needsUpdate = true; setOpacity(this.wildfireSmoke, fade * (0.1 + smokeRise * 0.035));
    }
    if (this.wildfireEmbers) {
      for (let i = 0; i < this.emberSeeds.length; i++) {
        const seed = this.emberSeeds[i]; const p = (t * (0.62 + lift * 0.28) * seed.speed + seed.offset) % 1;
        const angle = seed.phase + now * 0.0024 * gust * seed.speed;
        this.position.set(this.ctx.origin.x + seed.radius + Math.sin(angle) * (8 + p * 24), this.ctx.origin.y - 20 - p * (72 + lift * 68), 24 + Math.cos(angle) * 14);
        this.euler.set(angle, now * 0.005 * seed.speed, p * Math.PI * 2); this.quaternion.setFromEuler(this.euler);
        const emberScale = seed.scale * (0.25 + (1 - p) * 0.9); this.scale.setScalar(emberScale);
        this.matrix.compose(this.position, this.quaternion, this.scale); this.wildfireEmbers.setMatrixAt(i, this.matrix);
      }
      this.wildfireEmbers.instanceMatrix.needsUpdate = true; setOpacity(this.wildfireEmbers, fade * 0.82);
    }
  }

}

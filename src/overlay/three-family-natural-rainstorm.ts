import * as THREE from 'three';
import {
  downpourDropAt,
  downpourLayerCount,
  downpourSplashAt,
  fieldHash,
  resolveDownpourField,
  type DownpourLayer,
} from './downpour-field';
import { fadeAt, physicalMaterial, setOpacity, type FamilyContext, type FamilyLayer } from './three-family-shared';
import { clamp, shiftedColor } from './three-family-natural-shared';

const LAYERS: DownpourLayer[] = ['background', 'middle', 'foreground'];
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const LAYER_OPACITY: Record<DownpourLayer, number> = { background: 0.24, middle: 0.43, foreground: 0.66 };
const LAYER_Z: Record<DownpourLayer, number> = { background: -12, middle: 8, foreground: 30 };

type RainSheet = { layer: DownpourLayer; mesh: THREE.InstancedMesh };

/** Full-screen storm: three depth sheets, ground impacts and low water mist. */
export class DownpourNaturalStage implements FamilyLayer {
  private readonly group = new THREE.Group();
  private readonly config;
  private readonly sheets: RainSheet[] = [];
  private readonly splashes: THREE.InstancedMesh;
  private readonly mist: THREE.InstancedMesh;
  private readonly haze: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  constructor(private readonly ctx: FamilyContext) {
    this.config = resolveDownpourField(ctx.params);
    this.group.name = 'downpour-full-viewport';
    ctx.root.add(this.group);
    for (const layer of LAYERS) this.createSheet(layer);

    const splashCount = Math.round(clamp(ctx.width / 46 * this.config.splashEnergy, 14, 64));
    const splashMaterial = physicalMaterial(shiftedColor(ctx.color, 0.01, 0.13), ctx.energy, 'water');
    splashMaterial.opacity = 0.58;
    this.splashes = new THREE.InstancedMesh(new THREE.TorusGeometry(6, 1.15, 6, 20), splashMaterial, splashCount);
    this.splashes.name = 'downpour-splash-field';
    this.splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.splashes);

    const mistCount = Math.round(clamp(ctx.width / 105, 10, 42));
    const mistMaterial = physicalMaterial(shiftedColor(ctx.color, -0.02, -0.18), ctx.energy, 'smoke');
    mistMaterial.opacity = 0.12;
    this.mist = new THREE.InstancedMesh(new THREE.SphereGeometry(18, 10, 6), mistMaterial, mistCount);
    this.mist.name = 'downpour-ground-mist';
    this.mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mist);

    const hazeMaterial = physicalMaterial(shiftedColor(ctx.color, -0.015, -0.24), ctx.energy, 'smoke');
    hazeMaterial.opacity = 0.075;
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(ctx.width * 1.08, Math.max(72, ctx.height * 0.16)), hazeMaterial);
    this.haze.name = 'downpour-ground-haze';
    this.haze.position.set(0, -ctx.height / 2 + Math.max(35, ctx.height * 0.07), -20);
    this.group.add(this.haze);
  }

  update(t: number, _now: number): void {
    const fade = fadeAt(t, 0.8);
    const time = t * this.ctx.profile.duration;
    for (const { layer, mesh } of this.sheets) {
      for (let i = 0; i < mesh.count; i++) {
        const drop = downpourDropAt(i, mesh.count, this.ctx.width, this.ctx.height, this.config, layer, time);
        this.position.set(drop.x - this.ctx.width / 2, this.ctx.height / 2 - drop.y, LAYER_Z[layer] + drop.depth * this.config.sheetDepth * 5);
        // World Y grows upward while screen Y grows downward.  Keep the
        // instance slope in the same screen-space direction as Canvas:
        // positive wind produces a top-left to bottom-right rain streak.
        this.quaternion.setFromAxisAngle(Z_AXIS, Math.atan2(drop.vx, drop.vy));
        this.scale.set(0.72 + drop.depth * 0.48, drop.length, 0.65 + drop.depth * 0.3);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        mesh.setMatrixAt(i, this.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      setOpacity(mesh, fade * LAYER_OPACITY[layer]);
    }
    this.updateGround(t, time, fade);
  }

  private createSheet(layer: DownpourLayer): void {
    const count = downpourLayerCount(this.ctx.width, this.ctx.height, this.config, layer);
    const material = physicalMaterial(shiftedColor(this.ctx.color, 0.005, layer === 'foreground' ? 0.16 : 0.06), this.ctx.energy, 'water');
    material.opacity = LAYER_OPACITY[layer];
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 1, 0.8), material, count);
    mesh.name = `downpour-rain-${layer}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.sheets.push({ layer, mesh });
  }

  private updateGround(t: number, time: number, fade: number): void {
    for (let i = 0; i < this.splashes.count; i++) {
      const splash = downpourSplashAt(i, this.splashes.count, this.ctx.width, this.ctx.height, this.config, time);
      const p = (t * (2.4 + this.config.fallSpeed * 0.3) + splash.phase) % 1;
      this.position.set(splash.x - this.ctx.width / 2, -this.ctx.height / 2 + 7 + p * 8, 34 + i % 4);
      this.quaternion.identity();
      const radius = splash.radius / 6 * (0.28 + p * 1.45);
      this.scale.set(radius, radius * (0.22 + p * 0.08), 0.72);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.splashes.setMatrixAt(i, this.matrix);
    }
    this.splashes.instanceMatrix.needsUpdate = true;
    setOpacity(this.splashes, fade * 0.56);

    for (let i = 0; i < this.mist.count; i++) {
      const phase = fieldHash(i, 131); const p = (t * (0.24 + this.config.fallSpeed * 0.05) + phase) % 1;
      const x = (i + 0.5) / this.mist.count * this.ctx.width - this.ctx.width / 2;
      this.position.set(x + Math.sin(time * 0.0007 + phase * Math.PI * 2) * 26, -this.ctx.height / 2 + 18 + p * 44, -7 + i % 5);
      this.quaternion.identity();
      this.scale.set(1.7 + p * 2.3, 0.42 + p * 0.8, 0.55 + p * 0.45);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mist.setMatrixAt(i, this.matrix);
    }
    this.mist.instanceMatrix.needsUpdate = true;
    setOpacity(this.mist, fade * (0.08 + this.config.splashEnergy * 0.025));
    setOpacity(this.haze, fade * 0.075);
  }
}

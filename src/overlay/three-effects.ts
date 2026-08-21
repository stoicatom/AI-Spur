/** GPU material effects with one orthographic scene and instanced meshes. */
import * as THREE from 'three';
import type { EffectPresetId } from '../shared/material-packs';
import type { WhipVel } from './particles';
import { geometry, profileFor, type PhysicalProfile } from './three-effect-profiles';
import { CinematicLayers } from './three-effect-layers';
import { pixelRatioFor, resolveMaterialPhysics, type MaterialPhysics } from './three-effect-physics';
import { seedParticleStates, stepParticle, type ParticleState } from './three-particle-motion';
import { placeFamilySprite } from './three-family-timeline';
import { disposeSceneResources, disposeTextureOnce } from './three-effect-resources';
import { renderContractFor } from './three-effect-contract';
import { materialForDomain, type MaterialDomain } from './three-material-domains';
import { CinematicRenderPipeline } from './three-render-pipeline';
import { updateParticleMatrices } from './three-particle-render';
type SpriteRequest = { texture: THREE.Texture | null };
export type ThreeEffectSpec = {
  url: string;
  preset: EffectPresetId;
  hue: number;
  x: number;
  y: number;
  vel: WhipVel;
  params: Record<string, number>;
};
/** Owns every GPU resource for one overlay window and releases it on dispose. */
export class ThreeEffectRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pipeline: CinematicRenderPipeline;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  private readonly root = new THREE.Group();
  private sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private particles: THREE.InstancedMesh | null = null;
  private states: ParticleState[] = [];
  private light: THREE.PointLight | null = null;
  private layers: CinematicLayers | null = null;
  private started = 0;
  private duration = 1200;
  private alive = false;
  private width = 1;
  private height = 1;
  private profile: PhysicalProfile = profileFor('jet');
  private physics: MaterialPhysics = resolveMaterialPhysics(this.profile, {}, 1);
  private hue = 24;
  private origin = new THREE.Vector3();
  private direction = new THREE.Vector2(1, 0);
  private texture: THREE.Texture | null = null;
  private spriteRequest: SpriteRequest | null = null;
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly disposedTextures = new WeakSet<THREE.Texture>();
  private accumulator = 0;
  private lastUpdate = 0;
  private runId = 0;
  private disposed = false;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setClearAlpha(0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x160f0a, 1.35));
    const key = new THREE.DirectionalLight(0xffead4, 3.8);
    key.position.set(-240, 320, 460);
    const fill = new THREE.DirectionalLight(0x8fc9ff, 2.1);
    fill.position.set(300, 120, 260);
    const rim = new THREE.DirectionalLight(0xffffff, 2.8);
    rim.position.set(80, -260, -180);
    this.scene.add(key, fill, rim);
    this.pipeline = new CinematicRenderPipeline(this.renderer, this.scene, this.camera);
    this.resize();
  }
  get isAlive(): boolean { return this.alive; }
  resize(width = window.innerWidth, height = window.innerHeight): void {
    if (this.disposed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.height / 2;
    this.camera.bottom = -this.height / 2;
    this.camera.position.set(0, 0, 500);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    const pixelRatio = pixelRatioFor(this.width, this.height, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.pipeline.resize(this.width, this.height, pixelRatio);
  }
  start(spec: ThreeEffectSpec, now = performance.now()): void {
    if (this.disposed) throw new Error('ThreeEffectRenderer has been disposed');
    const runId = ++this.runId;
    this.clearScene();
    this.profile = profileFor(spec.preset);
    const contract = renderContractFor(spec.preset);
    this.duration = this.profile.duration;
    this.physics = resolveMaterialPhysics(this.profile, spec.params, spec.vel.speed);
    this.hue = spec.hue;
    this.origin.set(spec.x - this.width / 2, this.height / 2 - spec.y, 0);
    this.direction.set(spec.vel.vx, -spec.vel.vy);
    if (this.direction.lengthSq() < 0.001) this.direction.set(1, 0);
    else this.direction.normalize();
    const energy = this.physics.energy;
    const color = new THREE.Color(`hsl(${this.hue}, 100%, 62%)`);
    if (contract.pointLight) {
      this.light = new THREE.PointLight(color, 6 * energy, 300 * energy, 2);
      this.light.position.copy(this.origin);
      this.root.add(this.light);
    }
    this.layers = new CinematicLayers(this.root, this.origin, color, energy, this.profile, this.direction, this.width, this.height, spec.params);
    if (contract.genericParticles) this.addParticles(color, spec.vel);
    this.started = now;
    this.lastUpdate = now;
    this.accumulator = 0;
    this.alive = true;
    // Specialized stages own their geometry and never consume the source icon.
    // Avoid decoding and uploading a texture that cannot affect a frame.
    if (spec.url && contract.sourceSprite) this.loadSprite(spec.url, energy, runId);
  }
  update(now = performance.now()): boolean {
    if (this.disposed || !this.alive) return false;
    const t = Math.min(1, (now - this.started) / this.duration);
    const p = this.profile;
    const eased = 1 - Math.pow(1 - Math.max(0, (t - 0.08) / 0.92), 3);
    this.layers?.update(t, now, p);
    if (this.sprite) placeFamilySprite(this.sprite, t, now, p, this.physics, this.origin, this.direction);
    if (this.light) {
      this.light.position.set(this.origin.x + this.direction.x * eased * 60, this.origin.y + this.direction.y * eased * 60, 50);
      this.light.intensity = 6 * this.physics.energy * Math.sin(Math.PI * Math.min(1, t * 1.6));
    }
    if (this.particles) {
      // Physics is deliberately fixed at 60 Hz. Rendering can run at 60/120
      // Hz without changing the energy of a material or leaking allocations.
      this.accumulator += Math.min(0.1, Math.max(0, now - this.lastUpdate) / 1000);
      this.lastUpdate = now;
      const step = 1 / 60;
      let steps = 0;
      // Incoming elapsed time is capped at 100 ms, so six 60 Hz steps drain
      // it without dropping physical time after a single slow frame.
      while (this.accumulator + Number.EPSILON >= step && steps < 6) {
        for (let i = 0; i < this.states.length; i++) {
          const s = this.states[i];
          stepParticle(s, i, this.origin, this.direction, p, this.physics, step);
        }
        this.accumulator -= step;
        steps++;
      }
      if (steps === 6) this.accumulator = Math.min(this.accumulator, step);
      updateParticleMatrices(this.particles, this.states, p, this.physics, now);
    }
    this.pipeline.render();
    if (t >= 1) { this.alive = false; this.runId++; this.clearScene(); return true; }
    return false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.alive = false;
    this.runId++;
    this.clearScene();
    this.renderer.setAnimationLoop(null);
    this.renderer.renderLists.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
  }
  /** Cancel an interrupted crack (Esc, second hotkey, window teardown). */
  cancel(): void {
    if (this.disposed) return;
    this.alive = false;
    this.runId++;
    this.clearScene();
  }
  private addParticles(color: THREE.Color, vel: WhipVel): void {
    const count = this.physics.count;
    const energy = this.physics.energy;
    const material = materialForDomain(color, energy, domainForProfile(this.profile));
    material.opacity = 0.92;
    this.particles = new THREE.InstancedMesh(geometry(this.profile.particle, 3.4 + energy * 2.2), material, count);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.particles);
    this.states = seedParticleStates(
      count,
      this.origin,
      this.direction,
      this.profile,
      this.physics,
      vel,
      this.width,
      this.height,
    );
  }
  private loadSprite(url: string, energy: number, runId: number, attach = true): void {
    const request: SpriteRequest = { texture: null };
    this.spriteRequest = request;
    const accept = (loaded: THREE.Texture) => {
      const previous = request.texture;
      request.texture = loaded;
      if (previous && previous !== loaded) disposeTextureOnce(previous, this.disposedTextures);
      if (this.disposed || !this.alive || runId !== this.runId || this.spriteRequest !== request) {
        disposeTextureOnce(loaded, this.disposedTextures);
        return;
      }
      this.texture = loaded;
      if (!attach) return;
      const material = new THREE.MeshBasicMaterial({ map: loaded, color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
      const spriteSize = 64 + Math.sqrt(energy) * 24;
      this.sprite = new THREE.Mesh(new THREE.PlaneGeometry(spriteSize, spriteSize), material);
      this.sprite.position.set(this.origin.x, this.origin.y, 40);
      this.root.add(this.sprite);
    };
    const reject = () => {
      if (this.spriteRequest === request) { this.spriteRequest = null; this.texture = null; }
      disposeTextureOnce(request.texture, this.disposedTextures);
    };
    const texture = this.textureLoader.load(url, accept, undefined, reject);
    if (!request.texture) request.texture = texture;
    if (request.texture !== texture) disposeTextureOnce(texture, this.disposedTextures);
    if (this.spriteRequest !== request) disposeTextureOnce(texture, this.disposedTextures);
    else this.texture = request.texture;
  }
  private clearScene(): void {
    disposeSceneResources(this.root, this.texture, this.disposedTextures);
    this.root.clear();
    this.sprite = null; this.particles = null; this.states = []; this.light = null; this.layers = null;
    this.spriteRequest = null;
    this.texture = null;
    this.renderer.renderLists.dispose();
    try { this.renderer.clear(true, true, true); } catch {}
  }
}
/** Select a physical surface response for the compatibility particle path. */
export function domainForProfile(profile: PhysicalProfile): MaterialDomain {
  switch (profile.motion) {
    case 'flame': case 'wildfire': case 'fireworks': return 'fire';
    case 'splash': case 'rain': case 'downpour': case 'wave': return 'water';
    case 'shards': return profile.shape === 'octa' ? 'ice' : 'glass';
    case 'fracture': return 'glass';
    case 'tornado': case 'vortex': case 'singularity': return 'smoke';
    case 'petal': return 'fabric';
    case 'impact': return 'rock';
    default: return profile.family === 'rhythm' ? 'wood' : 'metal';
  }
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { disposeSceneResources } from './three-effect-resources';
import { budgetFor, type EffectBudget } from './effect-quality-budget';

/** Owns the cinematic post stack and image-based lighting resources. */
export class CinematicRenderPipeline {
  private readonly composer: EffectComposer;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentScene: RoomEnvironment | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private readonly disposedTextures = new WeakSet<THREE.Texture>();
  private disposed = false;

  private readonly passList: string[] = [];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    camera: THREE.Camera,
    budget: EffectBudget = budgetFor('cinematic'),
  ) {
    this.setupEnvironmentLighting();
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    renderPass.clearAlpha = 0;
    this.addPass('render', renderPass);

    if (budget.bloom) {
      this.addPass('bloom', new UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.55, 0.78));
    }

    this.addPass('output', new OutputPass());
  }

  private addPass(name: string, pass: Parameters<EffectComposer['addPass']>[0]): void {
    this.composer.addPass(pass);
    this.passList.push(name);
  }

  /** 已装配的 pass 名列表，供档位测试与开发日志核对。 */
  passNames(): readonly string[] {
    return this.passList;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.composer.dispose();
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    if (this.environmentScene) {
      disposeSceneResources(this.environmentScene, null, this.disposedTextures);
      this.environmentScene.clear();
      this.environmentScene = null;
    }
    this.pmremGenerator?.dispose();
    this.pmremGenerator = null;
  }

  /** Environment affects only PBR reflections, never the transparent background. */
  private setupEnvironmentLighting(): void {
    const renderer = this.renderer as THREE.WebGLRenderer & { capabilities?: unknown };
    if (!renderer.capabilities) return;
    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.environmentScene = new RoomEnvironment();
      this.environmentTarget = this.pmremGenerator.fromScene(this.environmentScene);
      this.scene.environment = this.environmentTarget.texture;
    } catch {
      this.scene.environment = null;
      this.environmentTarget?.dispose();
      this.environmentTarget = null;
      if (this.environmentScene) {
        disposeSceneResources(this.environmentScene, null, this.disposedTextures);
        this.environmentScene.clear();
        this.environmentScene = null;
      }
      this.pmremGenerator?.dispose();
      this.pmremGenerator = null;
    }
  }
}

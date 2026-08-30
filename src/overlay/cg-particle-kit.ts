/**
 * CG 粒子工具层：three.quarks 的档位感知封装。
 *
 * 42 个场景共用本模块创建 emitter，工具层集中保证三件事：
 *
 * 1. **档位裁剪**——粒子数按 §3.1 倍率缩放，场景只声明「电影级要多少」。
 * 2. **资源释放**——所有 ParticleSystem 由 hub 接管，dispose 一次清空，
 *    单个场景漏掉 dispose 不会泄漏 GPU 资源。
 * 3. **失效保护**——dispose 后的 emit / update 静默失效，
 *    避免特效被 cancel 后异步回调仍往已释放的根节点挂东西。
 *
 * 设计规格 §4.1 独立性规则 2：本模块只导出构件，不导出任何成品场景。
 */
import * as THREE from 'three';
import {
  BatchedRenderer,
  ConeEmitter,
  ConstantColor,
  ConstantValue,
  IntervalValue,
  ParticleSystem,
  PointEmitter,
  RenderMode,
  SphereEmitter,
  Vector4 as QuarksVector4,
} from 'three.quarks';
import type { EffectQuality } from '../shared/config';

/** 档位 → 粒子数倍率（设计规格 §3.1）。 */
export const QUALITY_PARTICLE_SCALE: Record<Exclude<EffectQuality, 'auto'>, number> = {
  cinematic: 1,
  high: 0.75,
  medium: 0.5,
  low: 0.3,
};

/**
 * 按档位缩放粒子数。
 *
 * 结果至少为 1：倍率把小数量层算到 0 会让该元素在低档整体消失，
 * 而设计要求的是「更稀疏」而非「不存在」。
 */
export function scaledCount(count: number, quality: EffectQuality): number {
  const scale = QUALITY_PARTICLE_SCALE[quality === 'auto' ? 'medium' : quality];
  return Math.max(1, Math.floor(count * scale));
}

/** emitter 形状：点爆发、锥形喷流、球面扩散，覆盖 42 场景的全部发射需求。 */
export type EmitterShape = 'point' | 'cone' | 'sphere';

export type EmitSpec = {
  /** 电影级下的粒子数，实际值由档位缩放。 */
  count: number;
  /** 生命期区间（秒）。 */
  lifetime: [number, number];
  /** 初速区间（像素/秒，正交相机下与世界单位同量纲）。 */
  speed: [number, number];
  /** 粒子尺寸区间（像素）。 */
  size: [number, number];
  /** 粒子颜色。 */
  color: THREE.Color;
  /** 发射形状，默认点爆发。 */
  shape?: EmitterShape;
  /** 锥形半角（弧度）/ 球半径（像素），随 shape 语义变化。 */
  spread?: number;
  /** 挂载位置（相对 root），默认原点。 */
  position?: THREE.Vector3;
  /** 是否持续发射；false 表示一次性爆发（默认）。 */
  looping?: boolean;
  /** 每秒发射率，仅 looping 时生效。 */
  rate?: number;
};

export interface ParticleHub {
  /** 批渲染器节点，已挂到 root。 */
  readonly batchedRenderer: BatchedRenderer;
  /** 当前接管的粒子系统数量。 */
  readonly systemCount: number;
  /** 创建一层粒子；dispose 后调用静默失效。 */
  emit(spec: EmitSpec): ParticleSystem | null;
  /** 推进粒子时间（秒）。 */
  update(delta: number): void;
  /** 释放全部粒子资源并从 root 摘除，幂等。 */
  dispose(): void;
}

function buildEmitter(shape: EmitterShape, spread: number) {
  if (shape === 'cone') return new ConeEmitter({ radius: 1, thickness: 1, arc: Math.PI * 2, angle: spread });
  if (shape === 'sphere') return new SphereEmitter({ radius: Math.max(1, spread), thickness: 1, arc: Math.PI * 2 });
  return new PointEmitter();
}

/**
 * 创建一个粒子中枢。
 *
 * @param root 场景挂载根节点
 * @param quality 已解析的画质档位（不接受 auto 的运行时歧义，由调用方解析）
 */
export function createParticleHub(root: THREE.Group, quality: EffectQuality): ParticleHub {
  const batchedRenderer = new BatchedRenderer();
  root.add(batchedRenderer);

  const systems: ParticleSystem[] = [];
  let disposed = false;

  // 单像素白纹理：粒子颜色由 startColor 决定，纹理只提供 alpha 载体。
  // 复用一张避免 42 场景各建一份采样纹理。
  const texture = new THREE.Texture();
  texture.needsUpdate = true;

  return {
    batchedRenderer,
    get systemCount() { return systems.length; },

    emit(spec: EmitSpec): ParticleSystem | null {
      if (disposed) return null;
      const shape = spec.shape ?? 'point';
      const count = scaledCount(spec.count, quality);
      const looping = spec.looping ?? false;

      const system = new ParticleSystem({
        duration: spec.lifetime[1],
        looping,
        startLife: new IntervalValue(spec.lifetime[0], spec.lifetime[1]),
        startSpeed: new IntervalValue(spec.speed[0], spec.speed[1]),
        startSize: new IntervalValue(spec.size[0], spec.size[1]),
        // quarks 有自己的 Vector4 实现，不能传 three 的同名类型。
        startColor: new ConstantColor(
          new QuarksVector4(spec.color.r, spec.color.g, spec.color.b, 1),
        ),
        emissionOverTime: looping ? new ConstantValue(spec.rate ?? count) : new ConstantValue(0),
        emissionBursts: looping ? [] : [{ time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 }],
        shape: buildEmitter(shape, spec.spread ?? 0.3),
        material: new THREE.MeshBasicMaterial({
          map: texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        }),
        renderMode: RenderMode.BillBoard,
      });

      if (spec.position) system.emitter.position.copy(spec.position);
      batchedRenderer.addSystem(system);
      root.add(system.emitter);
      systems.push(system);
      return system;
    },

    update(delta: number): void {
      if (disposed) return;
      batchedRenderer.update(delta);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const system of systems) {
        batchedRenderer.deleteSystem(system);
        system.emitter.removeFromParent();
        system.dispose();
      }
      systems.length = 0;
      // BatchedRenderer 自身无 dispose：它的 GPU 资源随各 ParticleSystem
      // 的 dispose 释放，节点摘除后即可被回收。
      batchedRenderer.removeFromParent();
      // 但它内部按材质分组生成的 SpriteBatch 子节点不随 deleteSystem 摘除，
      // 摘掉 renderer 后这些 batch 仍挂在它下面互相持有引用，整批粒子
      // 网格无法回收。与 cg-scene-kit 的嵌套容器泄漏同源——那次是场景
      // group 只清一层，这次是 renderer 只摘自己。30 个场景用 quarks，
      // 在此清一处即全部覆盖。
      batchedRenderer.clear();
      texture.dispose();
    },
  };
}

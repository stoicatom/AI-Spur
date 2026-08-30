/**
 * 场景 40 vinyl 的 ⑥ 音尘层。
 *
 * 尘是**唱针犁起来的**：发射点跟着针尖走（不是屏心固定喷），
 * 发射率随 `dustBurst` 在落针那一下最强、之后缓退。
 *
 * quarks 的 emitter 在 `hub.update()` 后会被 BatchedRenderer 从场景树
 * 摘走，按名字查不到，所以 `anchor` 是观测代理、`emitterPosition`
 * 暴露真身位置——代理与真身脱钩时，所有位置断言都会变成在验证一个
 * 装饰物（本项目 flame/moon/sun 场景踩过这个坑）。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import type { CgStageContext } from '../cg-scene';
import { createParticleHub, scaledCount, type ParticleHub } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { dustBurst } from './vinyl-groove';

/** 电影级下的音尘并发数。 */
const DUST_BUDGET = 44;
/** 满强度时的每秒发射率。 */
const PEAK_RATE = 30;

export interface DustLayer {
  readonly hub: ParticleHub;
  /** 观测锚点，镜像 emitter 位置。 */
  readonly anchor: THREE.Object3D;
  /** 当帧发射率（每秒粒子数），互动与档位缩放的可观测量。 */
  readonly emissionRate: number;
  /** 真正的 quarks emitter 当帧位置。 */
  readonly emitterPosition: THREE.Vector3 | null;
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param delta 帧间隔（秒）
   * @param tip 针尖当帧局部坐标
   */
  advance(t: number, delta: number, tip: THREE.Vector3): void;
  dispose(): void;
}

/**
 * 建立音尘层。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定粒子预算
 * @param short 画面短边（像素）
 */
export function createDustLayer(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
): DustLayer {
  const hub = createParticleHub(res.group, ctx.quality);

  const anchor = new THREE.Object3D();
  anchor.name = 'dust-anchor';
  res.group.add(anchor);

  const system = hub.emit({
    count: DUST_BUDGET,
    lifetime: [0.5, 1.2],
    // 初速小：尘是被轻轻犁起的，不是喷出去的。
    speed: [short * 0.02, short * 0.07],
    size: [short * 0.003, short * 0.008],
    color: new THREE.Color('#E8DCC0'),
    shape: 'sphere',
    spread: short * 0.012,
    looping: true,
    rate: PEAK_RATE,
  });

  let emissionRate = 0;

  return {
    hub,
    anchor,
    get emissionRate() { return emissionRate; },
    get emitterPosition() { return system ? system.emitter.position : null; },

    advance(t, delta, tip): void {
      if (res.disposed) return;

      // 发射点跟着针尖：尘从被读取的那一点扬起。
      anchor.position.copy(tip);

      if (system) {
        system.emitter.position.copy(tip);
        // 发射率与 dustBurst 同源，且随档位缩放。`emissionOverTime`
        // 是生成器不是数值，必须整体替换而不能改字段。
        const rate = scaledCount(PEAK_RATE, ctx.quality) * dustBurst(t);
        emissionRate = rate;
        system.emissionOverTime = new ConstantValue(rate);
      }

      hub.update(delta);
    },

    dispose(): void {
      hub.dispose();
    },
  };
}

/**
 * 场景 09 flame 的 ② 火星层。
 *
 * 规格互动①「火星在火舌**顶端**脱落升空」：脱落位置必须跟着火焰
 * 包络走（`emberDetachHeight`），火矮时在低处脱落、火高时脱落点也高。
 * 这是本场景与 wildfire「火星先到下一簇」的分野——那边火星是**水平
 * 传播的引燃信使**，这边是**竖直脱落的浮力产物**。
 *
 * 规格互动②「光影脉动与粒子发射频率同步」：发射率读 `flickerGate`，
 * 与光影脉动的光强是同一个函数，同步是必然而非调参。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import type { CgStageContext } from '../cg-scene';
import { createParticleHub, scaledCount, type ParticleHub } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { emberDetachHeight, flickerGate } from './flame-plume';

/** 电影级下的火星并发数。 */
const EMBER_BUDGET = 60;
/** 满门控时的每秒发射率。 */
const PEAK_RATE = 46;

export interface EmberLayer {
  readonly hub: ParticleHub;
  /**
   * 自持的具名锚点，镜像 emitter 位置。
   *
   * quarks 的 `system.emitter` 在 `hub.update()` 后会被 BatchedRenderer
   * 从场景树摘走，断言拿不到它的位置。锚点是唯一可靠的观测点
   * （本项目 moon/sun 场景踩过这个坑）。
   */
  readonly anchor: THREE.Object3D;
  /**
   * 当帧发射率（每秒粒子数），互动②与档位缩放的可观测量。
   *
   * quarks 的 `emissionOverTime` 是生成器对象，外部读不到有效数值；
   * 而这个量同时承载两件必须被验证的事——与光影门控同源、随档位缩放，
   * 所以和 `anchor` 一样明确暴露出来。
   */
  readonly emissionRate: number;
  /**
   * 真正的 quarks emitter 当帧位置。
   *
   * `anchor` 只是观测代理（emitter 会被 BatchedRenderer 从场景树摘走，
   * 名字查不到）。代理与真身脱钩时，全部互动①断言都会变成在验证一个
   * 装饰物——所以真身位置必须自己可断言。
   */
  readonly emitterPosition: THREE.Vector3 | null;
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param delta 帧间隔（秒）
   * @param tongueBaseY 火舌根部的世界 y（局部坐标）
   * @param tongueHeight 火舌满高（像素）
   */
  advance(t: number, delta: number, tongueBaseY: number, tongueHeight: number): void;
  dispose(): void;
}

/**
 * 建立火星层。
 *
 * @param res 场景资源容器（锚点挂在它的 group 下）
 * @param ctx 场景上下文，quality 决定粒子预算
 * @param short 画面短边（像素）
 */
export function createEmberLayer(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
): EmberLayer {
  const hub = createParticleHub(res.group, ctx.quality);

  // 锚点：与 emitter 同步移动，供断言观测脱落高度。
  const anchor = new THREE.Object3D();
  anchor.name = 'ember-anchor';
  res.group.add(anchor);

  const system = hub.emit({
    count: EMBER_BUDGET,
    lifetime: [0.7, 1.5],
    // 初速偏小：火星靠浮力慢慢升，不是被喷出去的。
    speed: [short * 0.06, short * 0.16],
    size: [short * 0.006, short * 0.014],
    color: new THREE.Color('#FFB347'),
    shape: 'cone',
    // 窄锥：火星在火舌顶端脱落后基本向上走。
    spread: 0.34,
    looping: true,
    rate: PEAK_RATE,
  });

  let emissionRate = 0;

  return {
    hub,
    anchor,
    get emissionRate() { return emissionRate; },
    get emitterPosition() { return system ? system.emitter.position : null; },

    advance(t, delta, tongueBaseY, tongueHeight): void {
      if (res.disposed) return;

      // 脱落高度随火焰包络走——这是互动①的实现。
      const detachY = tongueBaseY + emberDetachHeight(t) * tongueHeight;
      anchor.position.set(0, detachY, -8);

      if (system) {
        system.emitter.position.copy(anchor.position);
        // 发射率与光影脉动同源（互动②）。`emissionOverTime` 是生成器
        // 不是数值，必须整体替换而不能改字段。
        const gate = flickerGate(t);
        const rate = scaledCount(PEAK_RATE, ctx.quality) * gate;
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

/**
 * 场景 33 wildfire 的 ⑥ 火星飞升层——**水平传播的引燃信使**。
 *
 * 与 flame 的火星层（./flame-embers）刻意划清：
 *
 * | | flame | wildfire |
 * |---|---|---|
 * | 身份 | 竖直脱落的浮力产物 | 水平传播的引燃信使 |
 * | 发射点运动 | 只沿 y 移动（`|x| < 1e-6`） | 沿 x 净位移，领先火线 |
 * | 因果角色 | 不参与引燃 | 落点先到，下一簇随后点燃 |
 *
 * 发射锚点放在 `emberLandingX(t)`——火线**前方** `EMBER_LEAD` 处。这是
 * 野火实际的蔓延机制（spotting）：火星被风吹到火线前面落地生新火。
 * 领先量若为 0，火星就退化成火线自己的装饰，「引燃信使」这个身份也就
 * 没有可测内涵了。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import type { CgStageContext } from '../cg-scene';
import { createParticleHub, scaledCount, type ParticleHub } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { emberLandingX, windGust } from './wildfire-front';

/** 电影级下的火星并发数。 */
const EMBER_BUDGET = 72;
/** 满风时的每秒发射率。 */
export const PEAK_RATE = 54;

export interface WildfireEmberLayer {
  readonly hub: ParticleHub;
  /**
   * 自持的具名锚点，镜像 emitter 位置。
   *
   * quarks 的 `system.emitter` 在 `hub.update()` 后会被 BatchedRenderer 从
   * 场景树摘走，按名字查不到它。锚点是唯一可靠的观测点（本项目
   * moon/sun 场景踩过这个坑）。
   */
  readonly anchor: THREE.Object3D;
  /**
   * 当帧发射率（每秒粒子数）。
   *
   * quarks 的 `emissionOverTime` 是生成器对象，外部读不到有效数值；而
   * 这个量同时承载「随风起落」与「随档位缩放」两件必须被验证的事，
   * 所以和 `anchor` 一样明确暴露。
   */
  readonly emissionRate: number;
  /**
   * 真正的 quarks emitter 当帧位置。
   *
   * `anchor` 只是观测代理。代理与真身脱钩时，全部落点断言都会变成在
   * 验证一个装饰物——所以真身位置必须自己可断言。
   */
  readonly emitterPosition: THREE.Vector3 | null;
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param delta 帧间隔（秒）
   * @param width 覆盖层像素宽（把屏宽比例换成像素）
   * @param baseY 火线所在的世界 y（局部坐标）
   */
  advance(t: number, delta: number, width: number, baseY: number): void;
  dispose(): void;
}

/**
 * 建立火星层。
 *
 * @param res 场景资源容器（锚点挂在它的 group 下）
 * @param ctx 场景上下文，quality 决定粒子预算
 * @param short 画面短边（像素）
 */
export function createWildfireEmberLayer(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
): WildfireEmberLayer {
  const hub = createParticleHub(res.group, ctx.quality);

  const anchor = new THREE.Object3D();
  anchor.name = 'ember-anchor';
  res.group.add(anchor);

  const system = hub.emit({
    count: EMBER_BUDGET,
    lifetime: [0.5, 1.1],
    // 初速比 flame 大：火星要被风送到火线前方，不是靠浮力慢慢飘。
    speed: [short * 0.12, short * 0.32],
    size: [short * 0.005, short * 0.012],
    color: new THREE.Color('#FFC24A'),
    shape: 'cone',
    // 宽锥：被风撕开的火星散得比篝火的开。
    spread: 0.62,
    looping: true,
    rate: PEAK_RATE,
  });

  let emissionRate = 0;

  return {
    hub,
    anchor,
    get emissionRate() { return emissionRate; },
    get emitterPosition() { return system ? system.emitter.position : null; },

    advance(t, delta, width, baseY): void {
      if (res.disposed) return;

      // 落点领先火线——这是「引燃信使」的实现本体。
      anchor.position.set(emberLandingX(t) * width, baseY, -12);

      if (system) {
        system.emitter.position.copy(anchor.position);
        // 发射率随风起落：风大时火星被撕得多，与推进速率同源
        // （两者都读 windGust）。`emissionOverTime` 是生成器不是数值，
        // 必须整体替换而不能改字段。
        const rate = scaledCount(PEAK_RATE, ctx.quality) * (0.35 + windGust(t) * 0.65);
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

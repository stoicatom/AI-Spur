/**
 * 场景 38 元素⑧：琴键落下激起音尘（quarks）。
 *
 * 规格的互动条款是「音符沿五线谱跃动后坠落成尘」，所以发射率不是本层
 * 自己的曲线，而是**读音符的坠落进度**（`noteDustFall` 之和）。这样
 * 「音符落完才起尘」是同一个量的两次使用——改跳数或跳时长，起尘时刻
 * 会跟着动，不会出现音符还在天上而尘已经扬起的错帧。
 *
 * 锚点代理模式：quarks 的 ParticleSystem 在根节点不是 THREE.Scene 时
 * 首帧自毁（内部向上走到根检查 `type === 'Scene'`），测试 harness 的
 * root 是 Group，所以粒子内部状态在测试里观测不到。本层把可观测量
 * 挂在具名锚点的 userData 上作为唯一出口。
 */
import * as THREE from 'three';
import { ConstantValue, type ParticleSystem } from 'three.quarks';
import type { CgStageContext } from '../cg-scene';
import { createParticleHub, scaledCount, type ParticleHub } from '../cg-particle-kit';
import { KEY_STRIKE_COUNT, PIANO_DURATION_MS } from './piano-melody';
import { noteDustFall } from './piano-notes';

/** 电影级下的音尘数。 */
export const DUST_COUNT = 30;
/** 音尘的基准发射率（每秒），乘落尘强度得到实际值。 */
export const DUST_PEAK_RATE = 96;

export interface DustLayer {
  /** 具名锚点：可观测出口，位置落在键面。 */
  readonly anchor: THREE.Group;
  /** 当前发射率（每秒）。 */
  readonly emissionRate: number;
  /** 真实 emitter 的世界位置，用于保真探针；粒子系统缺席时为 null。 */
  readonly emitterPosition: THREE.Vector3 | null;
  /** 推进：t 为归一化进度，delta 为秒，seat 为落尘点（局部坐标）。 */
  advance(t: number, delta: number, seat: THREE.Vector3): void;
  dispose(): void;
}

/**
 * 落尘总强度（0→1）：所有已跳完的音符的坠落进度之和。
 *
 * 取和而非取最大：七个音符先后落下，尘应当累积成一片而不是只跟着
 * 最后一个走。除以 2.6 让三四个音符同时落时接近饱和。
 *
 * @param t 整幕归一化进度
 */
export function dustLevel(t: number): number {
  let sum = 0;
  for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
    const fall = noteDustFall(n, t);
    if (fall <= 0) continue;
    // 落尘本身也会散去：进度越深，扬起的新尘越少。
    sum += Math.max(0, 1 - fall) * fall * 4;
  }
  return Math.min(1, sum / 2.6);
}

/**
 * 建音尘层。
 *
 * @param parent 挂载父节点
 * @param ctx 场景上下文
 * @param short 屏幕短边（像素），用于换算速度尺度
 */
export function createDustLayer(
  parent: THREE.Object3D,
  ctx: CgStageContext,
  short: number,
): DustLayer {
  const anchor = new THREE.Group();
  anchor.name = 'dust-anchor';
  parent.add(anchor);

  const hub: ParticleHub = createParticleHub(anchor, ctx.quality);
  // 音尘：暖白细粉，锥形朝上散开（被落下的音符拍起来）。
  const system: ParticleSystem | null = hub.emit({
    count: DUST_COUNT,
    lifetime: [0.3, 0.78],
    speed: [short * 0.06, short * 0.24],
    size: [short * 0.004, short * 0.011],
    color: new THREE.Color('#FFE9C4'),
    shape: 'cone',
    spread: 0.86,
    looping: true,
    rate: 0,
  });

  let rate = 0;

  return {
    anchor,
    get emissionRate() { return rate; },
    get emitterPosition() { return system ? system.emitter.position : null; },

    advance(t: number, delta: number, seat: THREE.Vector3): void {
      // 锚点落在键面的落尘点：尘是从键上被拍起来的。
      anchor.position.copy(seat);
      // 发射率读音符坠落的同源量：音符落完才起尘。
      const level = dustLevel(t);
      rate = level * DUST_PEAK_RATE * (scaledCount(DUST_COUNT, ctx.quality) / DUST_COUNT);
      if (system) {
        // quarks 的 emissionOverTime 必须整体替换，改字段不生效。
        system.emissionOverTime = new ConstantValue(rate);
      }
      // 测试出口：粒子内部时钟观测不到，把折算后的值挂在锚点上。
      anchor.userData.particleT = t * PIANO_DURATION_MS / 1000;
      // 测试出口：发射率。这只能证明「率算对了」，不能证明「率真的生效」
      // ——quarks 要求整体替换 emissionOverTime，而改字段与整体替换在任何
      // 反读下都看不出差别（同一个实例）。真实差别只体现在粒子生成数量
      // 上，而 ParticleSystem 在 harness 的 Group 根下首帧自毁，粒子数
      // 不可观测。这条属于单测覆盖不到的边界，靠 §9 的目视验收兜底。
      anchor.userData.dustRate = rate;
      hub.update(delta);
    },

    dispose(): void {
      hub.dispose();
      anchor.removeFromParent();
    },
  };
}

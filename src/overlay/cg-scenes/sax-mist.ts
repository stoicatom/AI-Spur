/**
 * 场景 39 元素④：管口热雾（呼出雾，quarks 粒子层）。
 *
 * 「呼出的气」本身是一个持续的过程，不是某次击键的结果，所以发射率
 * 读旋律强度包络（`breathMist`）——吹得响，气就多。音符（在管口
 * 附近由同一个强度包络驱动）与这层雾是**同源的两次使用**：改包络，
 * 雾与音符一起变。
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
import { SAX_DURATION_MS } from './sax-sway';

/** 电影级下的雾粒子数。 */
export const MIST_COUNT = 34;
/** 雾的基准发射率（每秒），乘 breathMist 得到实际值。 */
export const MIST_PEAK_RATE = 74;

export interface MistLayer {
  /** 具名锚点：可观测出口，位置落在管口。 */
  readonly anchor: THREE.Group;
  /** 当前发射率（每秒）。 */
  readonly emissionRate: number;
  /** 真实 emitter 的世界位置，用于保真探针；粒子系统缺席时为 null。 */
  readonly emitterPosition: THREE.Vector3 | null;
  /** 推进：t 为归一化进度，delta 为秒，level 为旋律强度（0→1）。 */
  advance(t: number, delta: number, level: number): void;
  dispose(): void;
}

/**
 * 建热雾层。
 *
 * @param parent 挂载父节点
 * @param ctx 场景上下文
 * @param short 屏幕短边（像素），用于换算速度尺度
 */
export function createMistLayer(
  parent: THREE.Object3D,
  ctx: CgStageContext,
  short: number,
): MistLayer {
  const anchor = new THREE.Group();
  anchor.name = 'mist-anchor';
  parent.add(anchor);

  const hub: ParticleHub = createParticleHub(anchor, ctx.quality);
  // 暖白雾珠：锥形朝上散开，生命期长（雾是飘的，不是喷的）。
  const system: ParticleSystem | null = hub.emit({
    count: MIST_COUNT,
    lifetime: [0.5, 1.15],
    speed: [short * 0.05, short * 0.2],
    size: [short * 0.01, short * 0.03],
    color: new THREE.Color('#FFE3B8'),
    shape: 'cone',
    spread: 0.6,
    looping: true,
    rate: 0,
  });

  let rate = 0;

  return {
    anchor,
    get emissionRate() { return rate; },
    get emitterPosition() { return system ? system.emitter.position : null; },

    advance(t: number, delta: number, level: number): void {
      // 发射率读旋律强度：吹得响、气就多。
      rate = level * MIST_PEAK_RATE * (scaledCount(MIST_COUNT, ctx.quality) / MIST_COUNT);
      if (system) {
        // quarks 的 emissionOverTime 必须整体替换，改字段不生效。
        system.emissionOverTime = new ConstantValue(rate);
      }
      // 测试出口：粒子内部时钟观测不到，把折算后的值挂在锚点上。
      anchor.userData.particleT = t * SAX_DURATION_MS / 1000;
      // 测试出口：发射率。这只能证明「率算对了」，不能证明「率真的生效」
      // ——quarks 要求整体替换 emissionOverTime，而改字段与整体替换在任何
      // 反读下都看不出差别（同一个实例）。真实差别只体现在粒子生成数量
      // 上，而 ParticleSystem 在 harness 的 Group 根下首帧自毁，粒子数
      // 不可观测。这条属于单测覆盖不到的边界，靠 §9 的目视验收兜底。
      anchor.userData.mistRate = rate;
      hub.update(delta);
    },

    dispose(): void {
      hub.dispose();
      anchor.removeFromParent();
    },
  };
}

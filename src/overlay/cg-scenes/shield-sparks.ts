/**
 * 场景 25 shield 的 ④ 火花盾缘：quarks 火花沿**弹开方向**溢散。
 *
 * 发射方向不是独立参数，而是 `strikeDeflected()` 的屏幕像——火花是被
 * 弹开的那部分动能的可见形式，所以它必须与冲击波弧同向。把方向写成常量
 * 会让「火花沿弹开方向」退化成两处各自调参，签名也就测不出来了。
 *
 * 发射率读 `impactFlash`：与盾面裂纹共用同一门控，规格互动①「火花+裂纹
 * 同帧」于是是数学必然。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import type { CgStageContext } from '../cg-scene';
import { createParticleHub, scaledCount, type ParticleHub } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { impactFlash } from './shield-timeline';

/** 撞击瞬间的峰值发射率（电影级），实际值按档位缩放。 */
const PEAK_RATE = 220;

export interface SparkFan {
  readonly hub: ParticleHub;
  /**
   * 观测锚点：quarks 的 emitter 会被 BatchedRenderer 从场景树摘走，
   * 按名字查不到，所以自持一个同位节点供验收观测。
   */
  readonly anchor: THREE.Object3D;
  /** 真身 emitter 的当帧位置——代理与真身脱钩时验收要能发现。 */
  readonly emitterPosition: THREE.Vector3 | null;
  /** 当帧发射率（已按档位缩放），供档位与同源断言取用。 */
  readonly emissionRate: number;
  advance(t: number, delta: number): void;
  dispose(): void;
}

/**
 * 建立火花层。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定粒子密度
 * @param hitPoint 撞击点（局部坐标）：火花从这里溢出
 * @param deflectScreenAngle 弹开方向的屏幕角（弧度），由签名函数给出
 * @param short 画面短边，尺度基准
 */
export function createSparkFan(
  res: SceneResources,
  ctx: CgStageContext,
  hitPoint: THREE.Vector2,
  deflectScreenAngle: number,
  short: number,
): SparkFan {
  const hub = createParticleHub(res.group, ctx.quality);

  const anchor = new THREE.Object3D();
  anchor.name = 'sparkanchor-0';
  anchor.position.set(hitPoint.x, hitPoint.y, -3);
  res.group.add(anchor);

  const system = hub.emit({
    count: PEAK_RATE,
    lifetime: [0.14, 0.44],
    speed: [short * 0.5, short * 1.5],
    size: [Math.max(1.2, short * 0.004), Math.max(2.4, short * 0.011)],
    color: new THREE.Color('#FFD9A0'),
    shape: 'cone',
    // 窄锥：火花被弧面「导」向一个方向，不是四散。
    spread: 0.42,
    position: anchor.position.clone(),
    looping: true,
    rate: PEAK_RATE,
  });

  if (system) {
    // 锥轴转到弹开方向：这是签名接到元素④的那一步。
    // ConeEmitter 的轴默认沿 +z，绕 y 转不到屏幕平面内，所以绕 x 转 -90°
    // 先把轴放平到 xy 平面（指向 +y），再绕 z 转到目标角。
    system.emitter.rotation.set(-Math.PI / 2, 0, deflectScreenAngle - Math.PI / 2);
  }

  let emissionRate = 0;

  return {
    hub,
    anchor,
    get emitterPosition() { return system ? system.emitter.position : null; },
    get emissionRate() { return emissionRate; },

    advance(t, delta): void {
      if (res.disposed) return;
      if (system) {
        // 与裂纹共用门控（互动①）。`emissionOverTime` 是生成器不是数值，
        // 必须整体替换。
        emissionRate = scaledCount(PEAK_RATE, ctx.quality) * impactFlash(t);
        system.emissionOverTime = new ConstantValue(emissionRate);
      }
      hub.update(delta);
    },

    dispose(): void {
      hub.dispose();
    },
  };
}

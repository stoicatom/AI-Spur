/**
 * 场景 13 wind 的 ① 风场流线 与 ④ 扬尘幕：两层 Points 尘粒场。
 *
 * 尘粒用 THREE.Points 而非 quarks：旋转流场要求成千颗尘粒**持续**受同一个
 * WhirlField 驱动，且飞出画面要环绕重入（旷野的沙不会吹完就没）。
 * quarks 的生命周期是「发射-老化-死亡」，做不到无限循环的流场输运；
 * 逐粒改 position 才能让流线层与贴地尘层共用一套涡而速度不同。
 *
 * 与 ice 雪幕的差别：那里位置以「平流 + 局部涡扰动」给出，涡是插曲；
 * 这里涡是主流——核内位置**完全**由绕轴转角决定，环境风只作用于涡外。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import type { SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import { swirlFalloff, type WhirlField } from './wind-field';

/** 一层尘粒：Points 显示体 + 该层的流场系数。 */
export type DustLayer = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  /** 逐粒基准位置（不被风改写），环绕重入与涡旋归属都以它为准。 */
  base: Float32Array;
  /** 逐粒相位，让同层尘粒的颤动不同步。 */
  phase: Float32Array;
  /** 流场系数：流线层 1、贴地尘层 0.55（同一涡、两种速度）。 */
  parallax: number;
  /** 该层覆盖范围（世界单位），环绕重入的周期长度。 */
  spanX: number;
  spanY: number;
  /** 该层中心的纵向偏置：贴地尘幕压在下半屏。 */
  offsetY: number;
};

/** 伪随机：同一 (i, salt) 每次构建一致，尘粒形态因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

function buildLayer(
  res: SceneResources, ctx: CgStageContext, name: string, count: number,
  parallax: number, size: number, opacity: number, z: number,
  color: string, spanYScale: number, offsetY: number,
): DustLayer {
  // 铺开范围大于屏：屏外要有存量，风把屏内的吹走时屏缘才有尘补进来。
  const spanX = ctx.width * 1.4;
  const spanY = ctx.height * spanYScale;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const x = (rand(i, 21) - 0.5) * spanX;
    const y = (rand(i, 23) - 0.5) * spanY + offsetY;
    // z 只做层内微抖：正交相机下深度不产生透视，层次靠速度差表达。
    const zJitter = (rand(i, 27) - 0.5) * 2;
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = zJitter;
    base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = zJitter;
    phase[i] = rand(i, 29) * Math.PI * 2;
  }

  const geometry = res.track(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = res.track(new THREE.PointsMaterial({
    color, size, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
  }));
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.position.z = z;
  return { points, base, phase, parallax, spanX, spanY, offsetY };
}

/**
 * ① 风场流线 + ④ 扬尘幕。
 *
 * 贴地尘层粒子数更多、尺寸更小：贴地一格屏幕装得下更多沙，
 * 层数差与速度差一起才构成层次，只改速度会让尘层显得稀。
 */
export function buildDustLayers(res: SceneResources, ctx: CgStageContext): {
  streams: DustLayer;
  ground: DustLayer;
} {
  const short = Math.min(ctx.width, ctx.height);
  const streams = buildLayer(
    res, ctx, 'wind-streamlines', scaledCount(1250, ctx.quality),
    1, Math.max(2, short * 0.003), 0.72, 26, '#F2E2C4', 1.35, 0,
  );
  const ground = buildLayer(
    res, ctx, 'dust-veil', scaledCount(2100, ctx.quality),
    0.55, Math.max(1.3, short * 0.0018), 0.5, -18, '#D8C29C', 0.72,
    -ctx.height * 0.24,
  );
  res.group.add(streams.points, ground.points);
  return { streams, ground };
}

/** 环绕重入：把坐标折回覆盖范围，尘量因此恒定。 */
function wrap(value: number, span: number, offset: number): number {
  const shifted = value - offset + span * 0.5;
  return ((((shifted % span) + span) % span) - span * 0.5) + offset;
}

/**
 * 把风旋场推进到某一时刻，逐粒改写 position。
 *
 * 位移用**绝对时间**积分而非逐帧累加：update 可能以任意 t 稀疏调用，
 * 累加会让结果依赖调用历史，同一 t 画出不同帧。
 *
 * @param layer 目标层
 * @param wind 当帧风场（整幕唯一真值）
 * @param elapsed 自场景起始的秒数
 */
export function driveDustLayer(layer: DustLayer, wind: WhirlField, elapsed: number): void {
  const attr = layer.points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = attr.array as Float32Array;
  const { base, phase, parallax, spanX, spanY, offsetY } = layer;

  // drift 已是积分好的输运距离，这里只按层系数缩放，不再乘 elapsed。
  const drift = wind.drift * parallax;
  const dx = Math.cos(wind.angle) * drift;
  const dy = Math.sin(wind.angle) * drift;
  const jitterAmp = spanY * 0.01 * parallax;

  for (let i = 0; i < phase.length; i += 1) {
    const k = i * 3;
    // 湍流颤动：旷野的尘不走直线，给一点垂直风向的正弦抖动。
    const jitter = Math.sin(elapsed * 3.1 + phase[i]) * jitterAmp;

    // 尘柱成员归属按**基位到起始轴**的距离判定，不按当帧轴位：
    // 轴在横扫，按当帧轴判会让每帧都有粒子被拽进/丢出涡区，
    // 被拽进的一刻位置从平流位跳到旋转位（视觉上是弹出），
    // 且统计上把空间差异抹平。以起始轴为锚，尘柱成员固定，
    // 整根柱子随轴一起平移——旅行中的尘卷本来就是带着自己的沙走。
    const bx = base[k] - wind.anchorX;
    const by = base[k + 1] - wind.axisY;
    const baseR = Math.hypot(bx, by);
    const falloff = swirlFalloff(baseR, wind.coreRadius, wind.reach);

    if (wind.spin > 0 && falloff > 1e-3 && baseR > 1e-3) {
      // 涡内位置**直接**由绕轴转角给出，不叠加环境风平流。
      // 混合写法（旋转量乘 falloff 再加回平流位置）会自我抵消，
      // 实测方向偏离只剩 1°，视觉上等于没有涡。气旋内部自成流场，
      // 平流留给涡外的尘。整根柱子的平移由 axisX 带（不是逐粒风）。
      const omega = wind.spin * falloff * parallax;
      const cos = Math.cos(omega);
      const sin = Math.sin(omega);
      // 向心内吸 + 上升：半径随时间单调收拢、高度随时间单调抬升，
      // 两者叠在旋转上才是**螺旋**而不是平面转圈。
      const shrink = Math.max(0.15, 1 - (wind.inflowDist / Math.max(1, wind.reach)) * falloff);
      const rise = wind.lift * falloff * parallax;
      let rx = (bx * cos - by * sin) * shrink;
      let ry = (bx * sin + by * cos) * shrink + rise;
      // 柱体约束：涡把沙约束在自己的柱内，抬升不会把沙甩到柱外——
      // 向心内吸与上升在真实尘卷里是平衡的，柱宽保持不变。
      // 不加这一步的话，被抬高的沙粒离轴距离会超过 reach，于是
      // 「涡内」的沙出现在涡外的半径带上，旋转与平流两种流态混在一起。
      const outR = Math.hypot(rx, ry);
      if (outR > baseR && outR > 1e-3) {
        const back = baseR / outR;
        rx *= back; ry *= back;
      }
      array[k] = wind.axisX + rx - Math.sin(wind.angle) * jitter;
      array[k + 1] = wind.axisY + ry - wind.settle + jitter;
      continue;
    }

    // 涡外：环境风平流 + 颤动 + 尾幕沙沉，飞出范围则环绕重入。
    const x = base[k] + dx - Math.sin(wind.angle) * jitter;
    const y = base[k + 1] + dy + Math.cos(wind.angle) * jitter - wind.settle;
    array[k] = wrap(x, spanX, 0);
    array[k + 1] = wrap(y, spanY, offsetY);
  }
  attr.needsUpdate = true;
}

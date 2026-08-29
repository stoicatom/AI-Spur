/**
 * 场景 10 ice 的①狂风雪幕：两层视差雪粒场（本场景独立签名的载体）。
 *
 * 从 ice-parts 分出来，一是 CLAUDE.md 的 250 行上限，二是雪幕自带
 * 每帧逐粒推进的运动模型（风场 + 涡旋 + 环绕重入），
 * 与「摆一批 mesh」的静态搭建不是一件事，边界分开更清楚。
 *
 * 雪粒用 THREE.Points 而非 quarks：漫天暴雪需要三千级粒子**持续**
 * 受同一个风场驱动，且要能按屏幕边界环绕重入（雪不能吹完就没了）。
 * quarks 的生命周期模型是「发射-老化-死亡」，做不到无限循环的风场输运；
 * 逐粒改 position 属性才能让「近景快、远景慢」两层共用一套风向而速度不同。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import type { SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** 一层雪幕：Points 显示体 + 该层的视差系数。 */
export type SnowLayer = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  /** 逐粒基准位置（不被风改写），环绕重入时用它复位。 */
  base: Float32Array;
  /** 逐粒相位，让同层雪粒的飘摆不同步。 */
  phase: Float32Array;
  /**
   * 视差系数：近景 1、远景约 0.45。
   * 同一风场乘不同系数，才是「同一场风的远近两层」而非两套动画。
   */
  parallax: number;
  /** 该层覆盖范围（世界单位），环绕重入的周期长度。 */
  spanX: number;
  spanY: number;
};

/** 伪随机：同一 (i, salt) 每次构建一致，雪幕形态因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/**
 * 建一层雪粒。
 *
 * 铺开范围略大于屏：粒子要在屏外也有存量，风把屏内的吹走时
 * 屏缘才有雪补进来，否则横扫一阵后迎风侧会露出空白带。
 */
function buildLayer(
  res: SceneResources,
  ctx: CgStageContext,
  name: string,
  count: number,
  parallax: number,
  size: number,
  opacity: number,
  z: number,
): SnowLayer {
  const spanX = ctx.width * 1.35;
  const spanY = ctx.height * 1.35;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const x = (rand(i, 11) - 0.5) * spanX;
    const y = (rand(i, 13) - 0.5) * spanY;
    // z 只做层内微抖：正交相机下深度不产生透视，视差靠速度差表达。
    const zJitter = (rand(i, 17) - 0.5) * 2;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = zJitter;
    base[i * 3] = x;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = zJitter;
    phase[i] = rand(i, 19) * Math.PI * 2;
  }

  const geometry = res.track(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = res.track(new THREE.PointsMaterial({
    color: '#EAF4FF',
    size,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: false,
  }));

  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.position.z = z;

  return { points, base, phase, parallax, spanX, spanY };
}

/**
 * ① 狂风雪幕：远近两层。
 *
 * 远景层粒子数是近景的两倍——远处一格屏幕装得下更多雪，
 * 层数差与速度差一起才构成视差，只改速度会让远层显得稀。
 */
export function buildSnowVeil(res: SceneResources, ctx: CgStageContext): {
  veil: THREE.Group;
  near: SnowLayer;
  far: SnowLayer;
} {
  const veil = new THREE.Group();
  veil.name = 'snow-veil';
  res.group.add(veil);

  const short = Math.min(ctx.width, ctx.height);
  const near = buildLayer(
    res, ctx, 'snow-veil-near',
    scaledCount(1150, ctx.quality), 1, Math.max(2.2, short * 0.0032), 0.85, 30,
  );
  const far = buildLayer(
    res, ctx, 'snow-veil-far',
    scaledCount(2300, ctx.quality), 0.42, Math.max(1.2, short * 0.0016), 0.5, -40,
  );

  veil.add(near.points, far.points);
  return { veil, near, far };
}

/**
 * gather = 1 时雪只留在外侧 20%：这是「从屏幕两侧压入」的起始画面——
 * 两道雪墙贴着左右屏缘，中央还是空的，随后前沿向中心推进。
 */
const EDGE_FRONT = 0.8;

// windDrift / vortexSpin 已移入 ice-wind：它们是纯标量积分，与本文件的
// 逐粒缓冲区改写不是一类代码。此处转出，调用方无需改 import 路径。
export { windDrift, vortexSpin } from './ice-wind';

/** 一帧的风场状态，两层共享（视差由 parallax 系数拉开）。 */
export type WindField = {
  /** 风向（弧度），随时间扫掠。 */
  angle: number;
  /**
   * 已积分好的输运距离（世界单位）。
   *
   * 传距离而不是传速度：风速本身在变，`speed × elapsed` 不是速度的积分，
   * 会把「风在变强」重复计一次，使跨帧位移随时间虚增，
   * 涡旋这类局部扰动就被整体平移盖过去了。
   */
  drift: number;
  /** 涡旋中心（世界坐标）。 */
  vortexX: number;
  vortexY: number;
  /**
   * 涡旋累计转角（弧度，中心处峰值）。
   *
   * 涡旋做成「持续旋转」而不是「逐渐变大的固定偏移」：
   * 偏移量封顶后近爆点雪粒就不动了，而真实涡旋会一直卷着雪走——
   * 逐帧位移正比于切向速度，这才是局部力场可被测出来的特征。
   */
  spin: number;
  /** 涡旋作用半径。 */
  vortexRadius: number;
  /** 两侧压入量：1 = 雪只在左右屏缘成幕，0 = 横向铺匀。 */
  gather: number;
};

/**
 * 把风场推进到某一时刻，逐粒改写 position。
 *
 * 位移用**绝对时间**算而不是逐帧累加：场景 update 可能被以任意 t 调用
 * （测试就会跳着调），累加式积分会让结果依赖调用历史。
 * 绝对式让同一 t 永远得到同一帧画面。
 *
 * @param layer 目标层
 * @param wind 当帧风场
 * @param elapsed 自场景起始的秒数
 */
export function driveSnowLayer(layer: SnowLayer, wind: WindField, elapsed: number): void {
  const attr = layer.points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = attr.array as Float32Array;
  const { base, phase, parallax, spanX, spanY } = layer;

  // drift 已是积分好的输运距离，这里只按层视差缩放，不再乘 elapsed。
  const drift = wind.drift * parallax;
  const dx = Math.cos(wind.angle) * drift;
  const dy = Math.sin(wind.angle) * drift;
  const swayAmp = spanY * 0.012 * parallax;

  for (let i = 0; i < phase.length; i += 1) {
    const k = i * 3;
    // 飘摆：横风里的雪片不是直线走，给一点垂直风向的正弦摆动。
    const sway = Math.sin(elapsed * 2.4 + phase[i]) * swayAmp;

    // 涡旋归属按**静止基位**判定，不按被风吹过的当帧位置：后者每帧
    // 换一批粒子进出涡旋区，统计上会把空间差异抹平（探针实测各半径带
    // 位移几乎相同）。以基位为准，同一批粒子稳定地待在涡旋里。
    const bx = base[k] - wind.vortexX;
    const by = base[k + 1] - wind.vortexY;
    const baseR = Math.hypot(bx, by);
    const inVortex = wind.spin > 0 && baseR < wind.vortexRadius && baseR > 1e-3;
    // 涡旋区内横风被卷入的气旋压制，否则平流位移会淹没旋转位移。
    const windGain = inVortex ? 1 - (1 - baseR / wind.vortexRadius) * 0.9 : 1;

    // gather：把雪横向推向左右屏缘，中央留空。整层 scale 做不到这件事
    // ——那样粒子会连同间距一起被压扁，密度虚高；这里只搬位置，
    // 每片雪各自朝最近的屏缘靠，雪量与颗粒大小都不变。
    let gx = base[k];
    if (wind.gather > 0) {
      const half = spanX * 0.5;
      const side = gx >= 0 ? 1 : -1;
      // 目标位置落在外侧 EDGE_FRONT 之外的带里，前沿随 gather 回落而向中心推进。
      const target = side * half * (EDGE_FRONT + (1 - EDGE_FRONT) * Math.abs(gx) / half);
      gx += (target - gx) * wind.gather;
    }

    let x = gx + dx * windGain - Math.sin(wind.angle) * sway;
    let y = base[k + 1] + dy * windGain + Math.cos(wind.angle) * sway;

    // 环绕重入：飘出覆盖范围的粒子从对侧回来，雪量因此恒定。
    x = ((((x + spanX * 0.5) % spanX) + spanX) % spanX) - spanX * 0.5;
    y = ((((y + spanY * 0.5) % spanY) + spanY) % spanY) - spanY * 0.5;

    // 互动①：冰晶炸开的涡旋是**局部旋转流场**——近爆点的雪片绕爆点
    // 高速盘旋，远处几乎不受影响。
    //
    // 关键在于 spin 是**转角**而不是位移量：早先按位移写，粒子被推开
    // 一个固定距离就停住，于是近处的总位移反而小于被横风持续吹动的远处，
    // 「涡旋」名不副实。改为转角后，近处转过的弧长远大于远处，
    // 空间差异才真实存在，且转角随时间累积，雪片是在转圈而非偏移。
    if (inVortex) {
      const falloff = 1 - baseR / wind.vortexRadius;
      // spin 已是累计转角，这里只做空间衰减：按 falloff² 递减，
      // 近爆心转最快、边缘平滑归零，涡旋与外部雪幕之间没有突变边界。
      // 不再乘 elapsed —— 那会把时间积分重复算一次。
      const omega = wind.spin * falloff * falloff * layer.parallax;
      const cos = Math.cos(omega);
      const sin = Math.sin(omega);
      // 卷入：半径随转角收拢，雪片是被吸进气旋而非绕着空转。
      const shrink = 1 - falloff * 0.18;
      // 涡旋区内位置**直接**由绕爆心的旋转给出，不叠加平流位移。
      // 混合写法会让旋转量被 falloff 二次削弱、净效果被平流抹平
      // （探针实测方向偏离仅 1°，视觉上等于没有涡旋）。
      // 气旋内部本就自成流场，平流留给区外的雪幕。
      x = wind.vortexX + (bx * cos - by * sin) * shrink;
      y = wind.vortexY + (bx * sin + by * cos) * shrink;
    }

    array[k] = x;
    array[k + 1] = y;
  }
  attr.needsUpdate = true;
}

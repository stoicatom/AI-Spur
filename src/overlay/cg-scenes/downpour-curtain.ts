/**
 * 场景 32 downpour 的 ①雨帘：近景高速斜雨（万粒级）。
 *
 * 用 THREE.Points 逐粒推进而非 quarks，与 ice 雪幕同理：
 * quarks 的「发射-老化-死亡」模型做不到无限循环的风场输运，
 * 而暴雨要求雨丝**始终**铺满全屏（雨不能下完就没了）。
 *
 * 但运动模型与 ice 雪幕刻意相反，这是雨雪对照的物理根据：
 * - 雪：drag 主导（ice 的 drag 0.974，阻尼 2.6%），终端速度低、路径飘摆
 * - 雨：drag 0.999（阻尼 0.1%），近乎弹道——**直线**下落，只被风整体斜置
 *
 * 所以这里**没有**逐粒飘摆相位：所有雨滴共享同一个斜率，
 * 差异只在速度倍率（雨滴大小不同 → 终端速度不同）。加飘摆就变成雪了。
 *
 * 雨丝的「线」感由 LineSegments 承载：每滴是一条沿速度方向的短线段，
 * 长度 = 速度 × 曝光时间，这是真实相机拍雨的成像原理。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import type { SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import { rainFallSpeed, rainIncidence, rainDensity } from './downpour-field';

/** 电影级雨丝数（每条 2 顶点）。 */
const DROP_BUDGET = 2600;
/** 雨丝拖影的等效曝光秒数：决定线段长度。 */
const EXPOSURE_S = 0.026;
/** 雨滴速度倍率区间：大滴落得快，小滴慢。 */
const SPEED_LO = 0.72;
const SPEED_HI = 1.28;

function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

export interface RainCurtain {
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly dropCount: number;
  /** 单滴的当前拖影长度（像素），供雨丝长度断言取值。 */
  streakLength(index: number, t: number, short: number): number;
  advance(t: number, short: number): void;
  setOpacity(value: number): void;
}

/**
 * 建雨帘。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定雨丝数
 * @param spanX 覆盖宽度（像素），要大于画面宽以容纳斜雨的横向漂移
 * @param spanY 覆盖高度（像素）
 */
export function createRainCurtain(
  res: SceneResources,
  ctx: CgStageContext,
  spanX: number,
  spanY: number,
): RainCurtain {
  const count = scaledCount(DROP_BUDGET, ctx.quality);
  const positions = new Float32Array(count * 6);
  // 逐滴的基准撒点与速度倍率。
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const rate = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    baseX[i] = (rand(i, 5) - 0.5) * spanX;
    baseY[i] = (rand(i, 6) - 0.5) * spanY;
    rate[i] = SPEED_LO + rand(i, 7) * (SPEED_HI - SPEED_LO);
  }

  const geometry = res.track(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = res.track(new THREE.LineBasicMaterial({
    color: new THREE.Color('#BBD6F5'),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'rain-curtain';
  lines.position.z = -1;
  res.group.add(lines);

  /** 单滴拖影长度：速度 × 曝光。速度快的滴子拖影更长。 */
  function streak(index: number, t: number, shortPx: number): number {
    return rainFallSpeed(t, shortPx) * rate[index % count] * EXPOSURE_S;
  }

  return {
    lines,
    dropCount: count,
    streakLength: (index, t, shortPx) => streak(index, t, shortPx),

    advance(t, shortPx): void {
      const theta = rainIncidence(t, shortPx);
      // 输运位移用**闭式**而非逐帧累加：update 会被以任意 t 调用，
      // 累加式积分让同一 t 画出不同的帧（本项目 ice 场景已定此规）。
      const elapsed = t * 1.9;
      const fall = rainFallSpeed(t, shortPx);
      // 斜雨的方向单位向量：竖直向下旋 theta。
      const dx = Math.sin(theta);
      const dy = -Math.cos(theta);

      for (let i = 0; i < count; i += 1) {
        const v = fall * rate[i];
        // 沿雨向平移，超出覆盖范围则环绕重入（雨不能吹完就没了）。
        const travel = v * elapsed;
        let x = baseX[i] + dx * travel;
        let y = baseY[i] + dy * travel;
        // 环绕：对 span 取模，保证始终铺满。
        x = ((x + spanX * 0.5) % spanX + spanX) % spanX - spanX * 0.5;
        y = ((y + spanY * 0.5) % spanY + spanY) % spanY - spanY * 0.5;

        const len = v * EXPOSURE_S;
        const o = i * 6;
        // 线段头（上）→ 尾（下），沿雨向。
        positions[o] = x;
        positions[o + 1] = y;
        positions[o + 2] = 0;
        positions[o + 3] = x + dx * len;
        positions[o + 4] = y + dy * len;
        positions[o + 5] = 0;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeBoundingSphere();
      material.opacity = rainDensity(t) * 0.62;
    },

    setOpacity(value): void {
      material.opacity = value;
    },
  };
}

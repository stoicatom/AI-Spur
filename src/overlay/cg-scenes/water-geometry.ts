/**
 * 场景 12 water 的几何原料：水的形体与卵石的圆润。
 *
 * 与 water-parts 分开的理由同 ice-geometry：这里只回答「一根水柱/一颗水珠/
 * 一枚卵石长什么样」，不知道场上有几个、摆在哪、用什么材质——那些是搭建职责。
 */
import * as THREE from 'three';

/**
 * ① 水柱几何：**锚底**的单位高平面。
 *
 * 平移到 y ∈ [0, 1] 而不是默认的 [-0.5, 0.5]：柱体是从水面长出来的，
 * 缩放 scale.y 时底边必须钉在水面上。若用默认居中平面，
 * 「涌起」会变成上下同时向外撑开，柱底会插到水面以下去。
 */
export function columnGeometry(width: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, 1, 1, 24);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/**
 * ② 水珠几何：短轴略扁的球。
 *
 * 不用正球：飞行中的水滴被空气压成扁椭，正球看着像玻璃弹珠。
 * 分段取 8×6 —— 水珠尺寸只有几像素，再细的网格在屏上看不出来却白付顶点开销。
 */
export function dropletGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 8, 6);
  geometry.scale(1, 0.82, 1);
  return geometry;
}

/**
 * ⑥ 鹅卵石几何：被水磨圆的扁石。
 *
 * 用低阶细分的十二面体再压扁：卵石的定义特征是**没有棱**且**扁**
 * （长期被水流翻滚打磨）。方块会露出立方体轮廓，正球又太像珠子。
 */
export function pebbleGeometry(radius: number, flatten: number): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(radius, 1);
  geometry.scale(1.16, flatten, 0.9);
  return geometry;
}

/** ⑦ 水花白边几何：细碎白沫用极小的四面体，边缘因此不圆滑（是碎沫不是小球）。 */
export function foamGeometry(radius: number): THREE.BufferGeometry {
  return new THREE.TetrahedronGeometry(radius, 0);
}

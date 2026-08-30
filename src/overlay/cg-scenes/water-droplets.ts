/**
 * 场景 12 water 的 ② 水珠 与 ⑦ 水花白边：闭式弹道抛物线。
 *
 * 为什么不用 cannon：水珠要三十余颗、只受重力、且必须**任意 t 可重放**
 * （测试跳着调 update）。闭式弹道一次求值就给出精确位置，
 * 而刚体世界只能顺序积分——跳帧调用会得到与连续播放不同的画面。
 * 卵石那边情形相反（要落地反弹与接触约束），所以那边才用刚体。
 *
 * 命名刻意让两类节点前缀**互不包含**：水珠 `drop-<i>`、白沫 `spray-<i>`。
 * 若叫 `drop-` 与 `drop-foam-`，按前缀收集刚体时会把白沫一起收进来，
 * 「重力逐帧加速」的断言就会测到贴片而照样变绿（本项目真实事故）。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { dropletGeometry, foamGeometry } from './water-geometry';
import {
  WATER_PHYSICS_SPAN_S, ballisticImpactTime, ballisticY,
  columnRise, tauToProgress, waterRand,
} from './water-motion';

/** 一颗水珠：显示体 + 它自己的弹道参数（全部在构建期定好，运行期只求值）。 */
export type Droplet = {
  mesh: THREE.Mesh;
  /** 离开柱顶的物理时刻（秒）。 */
  birthTau: number;
  /** 出膛位置。y0 取当帧柱顶高度——水珠是从柱顶被抛出去的。 */
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  /** 触底时刻（秒，绝对物理时间）；永不触底为 Infinity。 */
  impactTau: number;
  /** 触底横坐标，涟漪就开在这里。 */
  impactX: number;
};

export type DropletField = {
  group: THREE.Group;
  droplets: Droplet[];
  foam: THREE.Group;
  foamBits: THREE.Mesh[];
  /** 水面高度，触底判定与涟漪落点共用同一条基准线。 */
  surfaceY: number;
};

/**
 * 建立水珠场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定水珠与白沫密度
 * @param surfaceY 水面高度（局部坐标）
 * @param columnHeight 水柱满高（像素），水珠出膛高度按当帧柱高取
 * @param gravity 重力加速度（正值，px/s²），与刚体世界共用同一个值
 */
export function buildDropletField(
  res: SceneResources,
  ctx: CgStageContext,
  surfaceY: number,
  columnHeight: number,
  gravity: number,
): DropletField {
  const { width, height, quality } = ctx;
  const short = Math.min(width, height);

  const group = new THREE.Group();
  group.name = 'droplet-field';
  group.position.z = 22;
  res.group.add(group);

  const count = scaledCount(38, quality);
  const geometry = res.track(dropletGeometry(Math.max(2.2, short * 0.0075)));
  const material = res.track(additiveMaterial('#BFEBFF', 0.9));
  const droplets: Droplet[] = [];

  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `drop-${i}`;
    // 未出膛前不可见：水珠在被抛出前并不存在，画在柱顶会变成一坨亮点。
    // 这也是验收可读的飞行窗口——visible 为真的区间就是它在空中的区间。
    mesh.visible = false;
    group.add(mesh);

    // 出膛时刻铺满整段物理时间的前 68%：一次性全抛会变成一朵烟花，
    // 水柱崩散是**持续**往外抛水，且末幕仍有水珠在空中（半屏铺满的前提）。
    const birthTau = waterRand(i, 3) * WATER_PHYSICS_SPAN_S * 0.68;
    const y0 = surfaceY + columnRise(tauToProgress(birthTau)) * columnHeight;
    // 横向速度左右对开，量级拉大到能把水珠送到半屏之外。
    const side = i % 2 === 0 ? 1 : -1;
    const vx = side * short * (0.24 + waterRand(i, 5) * 0.62);
    const vy = short * (0.52 + waterRand(i, 7) * 0.66);
    const x0 = (waterRand(i, 11) - 0.5) * short * 0.06;
    // 触底时刻是**弹道方程的解**，不是排好的时间表：
    // 改重力、改出膛速度、改水面高度，它都会跟着变（涟漪也随之改点）。
    const flight = ballisticImpactTime(y0, vy, gravity, surfaceY);
    droplets.push({
      mesh, birthTau, x0, y0, vx, vy,
      impactTau: birthTau + flight,
      impactX: Number.isFinite(flight) ? x0 + vx * flight : x0,
    });
  }

  // ⑦ 水花白边：柱顶溅出的细碎白沫。用独立小几何体而非拉长的水珠，
  // 白沫的视觉特征是「碎」——有棱、无固定朝向。
  const foam = new THREE.Group();
  foam.name = 'foam-spray';
  foam.position.z = 26;
  res.group.add(foam);

  const foamCount = scaledCount(26, quality);
  const foamGeo = res.track(foamGeometry(Math.max(1.4, short * 0.004)));
  const foamMat = res.track(additiveMaterial('#F2FDFF', 0.85));
  const foamBits: THREE.Mesh[] = [];
  for (let i = 0; i < foamCount; i += 1) {
    const bit = new THREE.Mesh(foamGeo, foamMat);
    bit.name = `spray-${i}`;
    bit.visible = false;
    foam.add(bit);
    foamBits.push(bit);
  }

  return { group, droplets, foam, foamBits, surfaceY };
}

/**
 * 把水珠场推进到某个物理时刻（闭式求值，与调用历史无关）。
 *
 * @param field 水珠场
 * @param tau 物理时刻（秒）
 * @param gravity 重力加速度（正值）
 */
export function driveDroplets(field: DropletField, tau: number, gravity: number): void {
  for (const drop of field.droplets) {
    const s = tau - drop.birthTau;
    const airborne = s >= 0 && tau <= drop.impactTau;
    drop.mesh.visible = airborne;
    if (!airborne) {
      // 出膛前停在柱顶、触底后停在落点：不可见，但位置保持物理上说得通的值，
      // 便于把落点当涟漪圆心读出来。
      const parkedX = s < 0 ? drop.x0 : drop.impactX;
      drop.mesh.position.set(parkedX, s < 0 ? drop.y0 : field.surfaceY, 0);
      continue;
    }
    drop.mesh.position.set(
      drop.x0 + drop.vx * s,
      ballisticY(drop.y0, drop.vy, gravity, s),
      0,
    );
  }
}

/**
 * 白沫跟着柱顶溅：只在崩散期出现，绕柱顶做短程放射。
 *
 * 白沫不做弹道：它是「水膜撕裂的瞬时碎屑」，寿命短到看不出抛物线，
 * 给它一套简化的放射位移比假装积分更诚实。
 *
 * @param field 水珠场
 * @param crestX 柱顶横坐标
 * @param crestY 柱顶高度
 * @param breakup 柱体失稳程度（0→1）
 * @param short 屏幕短边，散布半径的尺度基准
 */
export function driveFoam(
  field: DropletField, crestX: number, crestY: number, breakup: number, short: number,
): void {
  const bits = field.foamBits;
  for (let i = 0; i < bits.length; i += 1) {
    const bit = bits[i];
    // 错峰出现：白沫随失稳推进逐个撕开，不是整圈同时亮。
    const stagger = (i / bits.length) * 0.55;
    const life = breakup - stagger;
    bit.visible = life > 0;
    if (!bit.visible) continue;
    const angle = waterRand(i, 17) * Math.PI * 2;
    const reach = short * (0.03 + waterRand(i, 19) * 0.14) * Math.min(1, life * 2.4);
    bit.position.set(
      crestX + Math.cos(angle) * reach,
      crestY + Math.sin(angle) * reach * 0.7,
      0,
    );
    bit.rotation.set(angle, angle * 1.7, angle * 0.6);
    bit.scale.setScalar(Math.max(0.2, 1 - life * 0.55));
  }
}

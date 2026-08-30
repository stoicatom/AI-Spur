/**
 * 场景 27 spear 的 ② 螺旋气流：绕矛杆的螺旋涡管。
 *
 * 用逐个可寻址的 `Object3D` 气流点（而非只用 quarks）承载：验收要求
 * 「同一粒子的绕杆角度单调推进**且**沿杆位置单调前移」，而 quarks 的
 * emitter 一旦 `hub.update()` 跑过就被摘出场景树，粒子也不可按名字寻址。
 * quarks 那层仍在（表达雾化的细尘），但可测的螺旋骨架由本模块给。
 *
 * 合成方式取自 wind 的教训（ice / wind 都在这里失败过）：**涡内位置直接
 * 由绕杆转角决定**，不把旋转量乘衰减再加回平流位置——那样旋转会自我抵消，
 * 实测方向偏离只剩 1°。这里的横向两个自由度（y、z）**只**来自 (半径, 转角)，
 * 沿杆自由度只来自后掠积分，三者互不掺混。
 *
 * 与 ninja-star 的对照：那边是回旋轨迹（横向自由度独立于航向）；
 * 这里横向位移全部绑在绕杆相位上，杆轴方向不含任何摆动项——矛路是直线。
 */
import * as THREE from 'three';
import type { SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import type { EffectQuality } from '../../shared/config';
import {
  RUPTURE_BURST,
  airflowContinuity,
  airflowSpeed,
  spiralRadiusScale,
  swirlBackwash,
  swirlSpin,
} from './spear-flight';

/** 电影级的螺旋气流点数（降档只减这个数，元素不会消失）。 */
export const SWIRL_MOTES = 54;

/** 伪随机：同一 (i, salt) 每次构建一致，气流形态因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** 一颗气流点：显示体 + 它在螺旋上的固定身份（相位 / 后掠基位 / 管半径）。 */
type Mote = {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  /** 绕杆初相（弧度）：同一时刻各点分布在螺旋的不同角度上。 */
  readonly phase: number;
  /** 后掠基位（归一化尾迹长）：决定它在螺旋上的起始轴向位置。 */
  readonly base: number;
  /**
   * 该点所在流管的半径系数（常量）。
   *
   * **不随时间/轴位变化**：收束半径必须是「速度的函数」这一条因果的
   * 唯一变量源。若半径还吃当帧轴位，验收里「同速度必同半径」就测不出来。
   */
  readonly tube: number;
};

export type SwirlField = {
  /** 螺旋气流的容器节点（矛路的父级之外单独一层，便于整体淡入淡出）。 */
  readonly group: THREE.Group;
  readonly motes: readonly Mote[];
  /**
   * 把螺旋推进到某一时刻。
   *
   * @param t 整幕归一化进度
   * @param tipX 当帧枪尖的 x（世界/场景局部同量纲，矛路水平）
   * @param pathY 矛路所在高度
   * @param alpha 整层不透明度
   */
  drive(t: number, tipX: number, pathY: number, alpha: number): void;
  /** 当帧的气流连续性（1 = 完整涡管，0 = 已断）。 */
  continuityAt(t: number): number;
};

/**
 * 建一层螺旋气流。
 *
 * @param res 资源容器
 * @param quality 画质档位（只影响点数）
 * @param short 屏幕短边，用于尺寸量纲
 * @param wakeLength 尾迹总长（世界单位）：后掠归一化量乘它得到轴向距离
 */
export function buildSwirl(
  res: SceneResources,
  quality: EffectQuality,
  short: number,
  wakeLength: number,
  color: THREE.Color,
): SwirlField {
  const group = new THREE.Group();
  group.name = 'swirl-sheath';
  res.group.add(group);
  // 容器节点要单独登记回收：res.dispose() 只 clear 自己的 group，
  // 嵌套容器会连着 54 个子节点一起留在内存里（父级已摘除，泄漏不可见）。
  res.track({ dispose() { group.clear(); group.removeFromParent(); } });

  const count = scaledCount(SWIRL_MOTES, quality);
  const motes: Mote[] = [];
  const geometry = res.track(new THREE.CircleGeometry(Math.max(1.2, short * 0.0042), 8));

  for (let i = 0; i < count; i += 1) {
    const material = res.track(new THREE.MeshBasicMaterial({
      color: color.clone().lerp(new THREE.Color('#EAF4FF'), 0.55 + rand(i, 41) * 0.35),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    // 精确命名：`swirl-mote-<i>`，与 `flexbead-` / `shockring-` 互不包含。
    mesh.name = `swirl-mote-${i}`;
    group.add(mesh);
    motes.push({
      mesh,
      // 相位分成两条互不重合的螺旋线（双螺旋），单条会显得像串珠。
      phase: (i / count) * Math.PI * 4 + rand(i, 43) * 0.35,
      base: (i / count) * 0.52 + rand(i, 47) * 0.06,
      tube: short * 0.055 * (0.62 + rand(i, 53) * 0.62),
    });
  }

  return {
    group,
    motes,
    continuityAt: (t: number) => airflowContinuity(t),

    drive(t: number, tipX: number, pathY: number, alpha: number): void {
      const speed = airflowSpeed(t);
      // 互动①：收束半径只吃速度——速度越高气流贴杆越紧。
      const converge = spiralRadiusScale(speed);
      // 互动②：命中瞬间涡管被靶板截断，半径**突变**暴张。
      const rupture = 1 + (1 - airflowContinuity(t)) * RUPTURE_BURST;
      const spin = swirlSpin(t);
      const slip = swirlBackwash(t);

      for (const mote of motes) {
        // 沿杆：后掠积分单调增，气流点持续往矛尾方向滑。
        const axial = (mote.base + slip) * wakeLength;
        const radius = mote.tube * converge * rupture;
        const theta = mote.phase + spin;
        // 横向两个自由度**完全**由 (半径, 转角) 给出：没有任何平流项掺进来。
        mote.mesh.position.set(
          tipX - axial,
          pathY + Math.sin(theta) * radius,
          Math.cos(theta) * radius,
        );
        // 断裂后迅速熄灭：涡管没了，被它照亮的尘也就散了。
        // continuity 同时出现在半径与亮度上——一个真值两个出口，
        // 「气流断裂」不会在两处各演一条巧合曲线。
        mote.mesh.material.opacity =
          alpha * (0.35 + speed * 0.65) * airflowContinuity(t);
      }
    },
  };
}

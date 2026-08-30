/**
 * 场景 32 downpour 的 ③涟漪万环 + ②地面雨舞。
 *
 * 涟漪是本场景「一个风场驱动两种介质」签名的水侧载体：
 * 每个环的**形状**（压扁比）与**朝向**都来自 `downpour-field` 里那唯一的风场，
 * 与雨丝的入射角共用 `windSpeed`。因此「改风 → 雨斜了、环也扁了转了」
 * 是数学上的必然，而不是两处各写一份动画。
 *
 * 环用 RingGeometry + 逐环 scale/rotation：椭圆靠非等比缩放得到
 * （scale.x 长轴、scale.y 短轴），比为每个环重建几何体便宜得多。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import type { SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import {
  DOWNPOUR_ACT2_END,
  rippleAxisAngle,
  rippleFade,
  rippleFlatten,
  rippleRadius,
  splashPulse,
} from './downpour-field';

/** 电影级环数：「万环」的观感靠密集重生而非同屏数量堆到上万。 */
const RING_BUDGET = 120;
/** 环的生命期（秒）：与 rippleFade 的归零点一致。 */
const RING_LIFE = 0.62;

/** 伪随机：同一 (i, salt) 每次构建一致，涟漪分布因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

type Ring = {
  readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** 溅点位置（局部坐标）。 */
  readonly x: number;
  readonly y: number;
  /** 该环第一次溅起的时刻（归一化总进度）。 */
  readonly bornAt: number;
  /** 重生周期（归一化进度），让每个点位持续接力溅起。 */
  readonly period: number;
};

export interface RippleField {
  readonly group: THREE.Group;
  readonly rings: readonly Ring[];
  /** 当前可见环数，供「连成片」的密度断言取值。 */
  visibleCount(): number;
  advance(t: number, short: number): void;
  dispose(): void;
}

/**
 * 建涟漪场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定环数
 * @param short 画面短边（像素）
 * @param groundTop 地面区域上沿（局部 y），环撒在它与画面下缘之间
 * @param groundBottom 地面区域下沿（局部 y）
 */
export function createRippleField(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
  groundTop: number,
  groundBottom: number,
): RippleField {
  const group = new THREE.Group();
  group.name = 'ripple-field';
  res.group.add(group);

  const count = scaledCount(RING_BUDGET, ctx.quality);
  const geometry = res.track(new THREE.RingGeometry(0.86, 1, 40));
  const rings: Ring[] = [];

  for (let i = 0; i < count; i += 1) {
    // 每个环一份材质：opacity 逐环不同（各自的 age 不同）。
    const material = res.track(new THREE.MeshBasicMaterial({
      color: new THREE.Color('#CFE4FF'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    // 前缀 `ripple-` 与 `rainstreak-` / `splash-` 互不包含。
    mesh.name = `ripple-${i}`;

    // 溅点在地面带内均匀撒开；近处（y 小）环大，远处环小——透视。
    const x = (rand(i, 1) - 0.5) * short * 3.1;
    const y = groundBottom + rand(i, 2) * (groundTop - groundBottom);
    mesh.position.set(x, y, -2);

    rings.push({
      mesh,
      x, y,
      // 首次溅起时刻错开，且都落在雨至之后。
      bornAt: 0.14 + rand(i, 3) * 0.5,
      // 周期 0.22–0.42：主幕内每个点位能接力溅 2–4 次。
      period: 0.22 + rand(i, 4) * 0.2,
    });
    group.add(mesh);
  }

  let visible = 0;

  return {
    group,
    rings,
    visibleCount: () => visible,

    advance(t, shortPx): void {
      // 形状与朝向：整场只有这一处读风场，两种介质的响应因此同源。
      const flatten = rippleFlatten(t, shortPx);
      const axis = rippleAxisAngle(t);
      // 溅点强度做整体门控：「间歇」是规格明写的，雨舞不是均匀白噪。
      const gate = splashPulse(t);
      visible = 0;

      for (const ring of rings) {
        const { mesh, y, bornAt, period } = ring;
        // 休眠环必须**同时**清零不透明度与缩放：只清不透明度会把上一帧的
        // scale 留在对象上，虽然看不见，但场景状态就变成了「取决于怎么走到
        // 这个 t」而非「t 的函数」。稀疏/密集等价断言正是为此而设。
        if (t < bornAt) {
          mesh.material.opacity = 0;
          mesh.scale.set(0, 0, 1);
          continue;
        }
        // 接力重生：取当前周期内的相位当 age。
        const cycles = Math.floor((t - bornAt) / period);
        const phase = (t - bornAt) - cycles * period;
        // 归一化进度 → 秒（整幕 1.9s）。
        const age = phase * 1.9;
        if (age > RING_LIFE) {
          mesh.material.opacity = 0;
          mesh.scale.set(0, 0, 1);
          continue;
        }

        // 远处的环小：按 y 在地面带里的位置做透视缩减。
        const depth = 0.55 + 0.45 * (1 - (y - groundBottom) / Math.max(1e-6, groundTop - groundBottom));
        const r = rippleRadius(age, shortPx) * depth;
        // 椭圆：长轴 r，短轴 r·flatten。旋转到风向。
        mesh.scale.set(r, r * flatten, 1);
        mesh.rotation.z = axis;

        // 雨止后不再有新环，但已生成的环还要淡完。
        const stillRaining = t < DOWNPOUR_ACT2_END + 0.08;
        const alpha = rippleFade(age) * gate * (stillRaining ? 1 : 0.35);
        mesh.material.opacity = alpha * 0.75;
        if (mesh.material.opacity > 0.02) visible += 1;
      }
    },

    dispose(): void {
      // 资源由 res 统一释放，子树由工具层递归清空。
    },
  };
}

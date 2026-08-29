/**
 * 场景 01 rocket（jet · 发射升空，1200ms）。
 *
 * 三幕（规格 §4.2 场景 01）：
 * - 0–240ms   点火抖动（发射台颤动 + 烟慢升）
 * - 240–900ms 升空（尾焰拉长、发射台闪白退出）
 * - 900–1200ms 二级点火 + 音爆环 + 星屑散尽
 *
 * 互动：①主焰熄灭瞬间音爆环从锥底扩散，推开两侧烟柱形成蘑菇帽；
 * ②碎屑被音爆环扫动改变轨迹（扫动判定吃环的运行时半径真值）；
 * ③地平线光带随引擎亮度整体增辉（与主焰共用同一份亮度，不另演一条曲线）。
 * 三者都读同一份运行时真值，耦合是真的。
 *
 * 独立签名：**自下而上「发射」构图 + 发射台闪白消隐**——全库只有这个场景
 * 把主体沿中轴线自下而上贯穿，也只有它让一组结构件闪白后彻底退场。
 *
 * 元素搭建在 ./rocket-parts，碎屑刚体在 ./rocket-debris，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildRocketParts } from './rocket-parts';
import { createDebrisField } from './rocket-debris';

/** 第一幕结束点（240/1200）。 */
export const ROCKET_ACT1_END = 240 / 1200;
/** 第二幕结束点（900/1200）。 */
export const ROCKET_ACT2_END = 900 / 1200;

/** 后环滞后前环的幕内进度，双环因此「依次」而非同时扩散。 */
const RING_LAG = 0.22;

export type PadDismissal = {
  /** 闪白强度：一记窄脉冲。 */
  flash: number;
  /** 结构件存在度：1 完整、0 已消隐。 */
  presence: number;
};

/**
 * 发射台闪白消隐曲线（纯函数，便于直接验收签名）。
 *
 * 「闪白消隐」的先后是曲线本身的性质：闪白窗口 0.28→0.66 内峰值 0.47，
 * 而 presence 直到 0.5 才开始掉。所以闪到最亮时台还在，之后才退场，
 * 不靠调用方按顺序调用来保证。presence 单调不回头——结构件退场没有反悔一说。
 *
 * @param p 第二幕内归一化进度
 */
export function padDismissal(p: number): PadDismissal {
  const k = Math.min(1, Math.max(0, p));

  // 闪白：0.28–0.66 的窄窗，峰值 0.47（窗口中点）。
  const flash = k > 0.28 && k < 0.66 ? Math.pow(Math.sin(((k - 0.28) / 0.38) * Math.PI), 0.6) : 0;

  // 消隐：0.5 起退，1 时归零。指数 <1 让退场前段慢、后段快，
  // 读作「先被强光吃掉轮廓、再整体抽离」。
  const presence = k <= 0.5 ? 1 : 1 - Math.pow((k - 0.5) / 0.5, 0.7);

  return { flash, presence };
}

function createRocketStage(ctx: CgStageContext): CgStage {
  const parts = buildRocketParts(ctx);
  const { res, scale, padY, flame, flameCore, flameLength, columns, platform, pillars } = parts;
  const { width, height } = ctx;
  const debris = createDebrisField(res, ctx, scale, padY);

  // 粒子层：喷口燃屑与两侧灰烟，补足 shader 柱体给不出的颗粒感。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 90,
    lifetime: [0.25, 0.6],
    speed: [scale * 2.2, scale * 5.5],
    size: [2, 6],
    color: new THREE.Color('#BFE2FF'),
    shape: 'cone',
    spread: 0.32,
    position: new THREE.Vector3(0, padY + scale * 0.3, 2),
  });
  hub.emit({
    count: 60,
    lifetime: [0.6, 1.2],
    speed: [scale * 0.6, scale * 1.8],
    size: [10, 26],
    color: new THREE.Color('#6E747C'),
    shape: 'cone',
    spread: 0.62,
    position: new THREE.Vector3(0, padY + scale * 0.1, -10),
  });

  // 星点静态排布：运行期只改亮度与轻微闪烁，位置固定（星空不该跟着帧漂）。
  const starMatrix = new THREE.Matrix4();
  const starBase: { x: number; y: number; phase: number }[] = [];
  for (let i = 0; i < parts.stars.count; i += 1) {
    starBase.push({
      // 哈希散布而非等距：等距会显出可见的网格。
      x: ((((i * 71) % 197) / 197) - 0.5) * width * 1.1,
      y: ((((i * 53) % 179) / 179) - 0.5) * height * 1.05,
      phase: i * 1.31,
    });
  }

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, ROCKET_ACT1_END, ROCKET_ACT2_END);

      // ① 引擎主焰：第一幕点起、第二幕拉长到贯穿全屏、第三幕熄灭。
      // 熄灭曲线用平方，让「熄灭瞬间」够利落——互动① 的触发点就落在这里。
      const burn = Math.min(1, act1 * 1.2) * Math.pow(1 - act3, 2);
      const stretch = 0.42 + act2 * 0.58;
      flame.material.opacity = burn * 0.85;
      flameCore.material.opacity = burn;
      // 只拉长纵向：锥底随之压向屏幕下缘，形成自下而上的光柱。
      flame.scale.set(1 + act2 * 0.22, stretch, 1);
      flameCore.scale.set(1 + act2 * 0.18, stretch * 0.96, 1);
      // 锥尖钉在喷口，锥体向下伸展；喷口随升空略微上移。
      const nozzleY = padY + scale * 0.55 + act2 * height * 0.2;
      const coneCenter = nozzleY - flameLength * stretch * 0.5;
      flame.position.y = coneCenter;
      flameCore.position.y = coneCenter + flameLength * stretch * 0.08;

      // ② 尾烟两侧：第一幕慢升，升速随幕推进递减（燃气离喷口越远越慢），
      // 体积随之膨胀。
      const smokeRise = act1 * 0.5 + Math.pow(act2, 0.6) * 1.4 + act3 * 0.4;
      const density = Math.min(1, act1 * 0.75 + act2 * 0.5) * (1 - act3 * 0.35);

      // ④ 音爆环：第三幕自锥底扩散，双环依次起跳。
      // 半径以屏幕对角为量程，末端触达四缘。
      const reach = Math.hypot(width, height) * 0.6;
      const ringBaseY = nozzleY - flameLength * stretch;
      let frontRadius = 0;
      for (let i = 0; i < parts.rings.length; i += 1) {
        const ring = parts.rings[i];
        // 后环滞后：同一条曲线上错开起点，前环永远在外圈。
        const p = Math.max(0, (act3 - i * RING_LAG) / (1 - i * RING_LAG));
        const radius = p > 0 ? scale * 0.4 + Math.pow(p, 0.8) * reach : 0;
        if (i === 0) frontRadius = radius;
        ring.scale.setScalar(p > 0 ? Math.max(0.001, radius / parts.ringOuter) : 0.001);
        ring.material.opacity = p > 0 ? Math.pow(1 - p, 1.4) * 0.8 : 0;
        // 环心贴锥底：这是「从锥底扩散」的几何依据，不是画面中心。
        ring.position.y = ringBaseY;
      }

      // 互动①：前环波前推开烟柱。推开量按波前是否已越过柱心算，
      // 越过越多帽檐张越大——柱心位移与帽檐张开吃的是同一个真值。
      const overtake = Math.max(0, Math.min(1, (frontRadius - width * 0.17) / (width * 0.3)));
      for (const column of columns) {
        const uniforms = column.mesh.material.uniforms;
        uniforms.uTime.value = seconds;
        uniforms.uDensity.value = density;
        uniforms.uRise.value = smokeRise;
        uniforms.uCap.value = overtake;
        column.mesh.position.x = column.restX + column.side * overtake * width * 0.1;
      }

      // 互动②：碎屑被同一个波前扫动。第一幕点火即崩起，此后交给刚体演化。
      if (act1 > 0.2) debris.ignite();
      debris.update(delta);
      debris.sweep(frontRadius);
      debris.setOpacity(Math.min(1, act1 * 1.5) * (1 - act3 * 0.5) * 0.9);

      // ③ 发射台：第一幕颤动，第二幕闪白后消隐，第三幕不留痕。
      const { flash, presence } = padDismissal(act2);
      const shake = act1 * (1 - act2) * scale * 0.03;
      const alive = act3 > 0 ? 0 : presence;
      platform.material.opacity = Math.max(alive * 0.9, flash * alive > 0 ? flash : 0) * (alive > 0 ? 1 : 0);
      platform.position.set(
        Math.sin(seconds * 52) * shake,
        padY + Math.cos(seconds * 61) * shake * 0.6,
        platform.position.z,
      );
      for (let i = 0; i < pillars.length; i += 1) {
        const pillar = pillars[i];
        pillar.material.opacity = platform.material.opacity;
        pillar.position.x = pillar.userData.baseX ?? (pillar.userData.baseX = pillar.position.x);
        pillar.position.x += Math.sin(seconds * 48 + i) * shake;
        pillar.position.y = padY + scale * 0.75 + Math.cos(seconds * 55 + i) * shake * 0.6;
      }

      // 互动③：地平线光带与主焰共用同一份亮度真值。
      const horizonUniforms = parts.horizon.material.uniforms;
      horizonUniforms.uTime.value = seconds;
      horizonUniforms.uGlow.value = flame.material.opacity;

      // ⑧ 二级点火亮斑：第三幕在喷口处脉冲，随升空跟到尾焰顶端。
      const pulse = 0.55 + 0.45 * Math.sin(seconds * 26);
      parts.ignition.material.opacity = Math.pow(act3, 0.5) * pulse * 0.95;
      parts.ignition.position.y = nozzleY + scale * 0.2 + act3 * height * 0.12;
      parts.ignition.scale.setScalar(0.6 + act3 * 0.9 + pulse * 0.25);

      // ⑦ 背景星点阵：轻微闪烁；第三幕随「星屑散尽」整体隐去。
      const starGain = (0.35 + act1 * 0.65) * (1 - act3 * 0.85);
      for (let i = 0; i < starBase.length; i += 1) {
        const base = starBase[i];
        const twinkle = 0.5 + 0.5 * Math.sin(seconds * 3.2 + base.phase);
        const size = Math.max(0.001, twinkle * starGain);
        starMatrix.makeScale(size, size, size);
        starMatrix.setPosition(base.x, base.y, 0);
        parts.stars.setMatrixAt(i, starMatrix);
      }
      parts.stars.instanceMatrix.needsUpdate = true;
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      debris.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'rocket',
    title: '发射升空',
    elements: [
      '引擎主焰', '尾烟两侧', '发射台结构网格', '音爆环',
      '燃料碎屑', '地平线光带 shader', '背景星点阵', '二级点火亮斑',
    ],
    signature: '唯一自下而上"发射"构图的素材；发射台消隐只此一例',
    preset: 'jet',
  },
  createRocketStage,
);

export { createRocketStage };

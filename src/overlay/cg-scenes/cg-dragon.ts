/**
 * 场景 04 dragon（wave · 腾龙戏珠，1200ms）。
 *
 * 三幕（规格 §4.2 场景 04）：
 * - 0–300ms   云破龙现
 * - 300–900ms 蜿蜒缠珠 + 龙息
 * - 900–1200ms 龙腾入云、珠光余晖
 *
 * 互动：①龙身缠绕光珠时珠光沿鳞片流走（缠绕紧密度决定流光强度，
 * 流光位置沿链推进）；②龙息推散云层（火团位置直接喂给云 shader 的挖孔中心）；
 * ③珠轨随龙身摆幅摆动（与链形共用同一个 sway）。
 * 三者都从骨骼链的当帧真值取参，因此耦合是真的而非各演各的。
 *
 * 独立签名：**骨骼链 mesh + 缠绕**——全库只有这个场景的主体是一条
 * 前向运动学链（后节挂在前节上、节间距恒定），并用它去圈住另一个元素。
 *
 * 链的数学在 ./dragon-spine（纯函数，可直接断言），
 * 元素搭建在 ./dragon-parts，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { PEARL_COLOR, buildDragonParts } from './dragon-parts';
import {
  COIL_RANGE,
  SPINE_JOINT_COUNT,
  coilCenter,
  dragonSpine,
  orbitScaleFor,
  spineSway,
} from './dragon-spine';

/** 第一幕结束点（300/1200）。 */
export const DRAGON_ACT1_END = 300 / 1200;
/** 第二幕结束点（900/1200）。 */
export const DRAGON_ACT2_END = 900 / 1200;

/** 龙息喷吐窗口（归一化），落在第二幕内：规格要求「一次喷吐」。 */
export const BREATH_START = 420 / 1200;
export const BREATH_END = 660 / 1200;

/** 珠光沿链流走一轮所需的时间（秒）。 */
const FLOW_PERIOD = 0.55;

function createDragonStage(ctx: CgStageContext): CgStage {
  const parts = buildDragonParts(ctx);
  const { res, nodes, segment, cloud, pearl, halo, orbitGroup, orbits, rain, breath, mist } = parts;
  const { width, height } = ctx;

  // 粒子层：鳞光沿龙身流窜 + 龙息火团，档位与释放由工具层统一管。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 80,
    lifetime: [0.45, 1.1],
    speed: [segment * 0.15, segment * 0.5],
    size: [2, 5.5],
    color: new THREE.Color(PEARL_COLOR),
    shape: 'sphere',
    spread: segment * 2.4,
  });
  hub.emit({
    count: 54,
    lifetime: [0.3, 0.8],
    speed: [segment * 0.9, segment * 2.2],
    size: [3, 8],
    color: new THREE.Color('#FF9A4D'),
    shape: 'cone',
    spread: 0.42,
  });

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, DRAGON_ACT1_END, DRAGON_ACT2_END);

      // ① 骨骼链：摆幅、行进与波相位都由纯函数给，本层只负责摆节点。
      const sway = spineSway(t);
      const joints = dragonSpine({
        width,
        height,
        // 第一幕自云中推出，第三幕继续前行腾入云：advance 单向推进。
        advance: 0.18 + act1 * 0.32 + act2 * 0.28 + act3 * 0.34,
        phase: seconds * 3.1,
        sway,
      });

      // 龙现身：第一幕淡入，第三幕入云淡出。
      const bodyAlpha = Math.pow(act1, 1.3) * (1 - Math.pow(act3, 0.8) * 0.96);
      for (let i = 0; i < SPINE_JOINT_COUNT; i += 1) {
        const joint = joints[i];
        const nodePart = nodes[i];
        nodePart.joint.position.set(joint.x, joint.y, 0);
        // 胶囊默认竖立，减 90° 让它沿链走向卧倒。
        nodePart.segment.rotation.z = joint.angle - Math.PI / 2;
        nodePart.segment.material.opacity = bodyAlpha * (0.55 + (1 - i / SPINE_JOINT_COUNT) * 0.45);

        nodePart.scale.position.set(joint.x, joint.y, 2);
        nodePart.scale.rotation.z = joint.angle;
        nodePart.scale.material.uniforms.uAlpha.value = bodyAlpha * 0.9;
      }

      // ④⑤ 珠位：缠珠期珠落在中段骨节的质心，因此珠真的被链圈住。
      const coil = coilCenter(joints);
      pearl.position.set(coil.x, coil.y, 6);
      halo.position.set(coil.x, coil.y, 4);
      orbitGroup.position.set(coil.x, coil.y, 5);

      // 缠绕紧密度：中段各节到珠心的距离越接近一节长，圈得越紧。
      let spread = 0;
      for (let i = COIL_RANGE.from; i <= COIL_RANGE.to; i += 1) {
        spread += Math.hypot(joints[i].x - coil.x, joints[i].y - coil.y);
      }
      const meanRadius = spread / (COIL_RANGE.to - COIL_RANGE.from + 1);
      // 归一化到「一节半」为基准：越小越紧，钳到 0~1。
      const coiling = Math.max(0, Math.min(1, 1 - meanRadius / (segment * 1.5)));
      // 只有龙已现身且尚未离场时才谈缠绕。
      const coilGain = coiling * Math.min(act1, 1) * (1 - act3 * 0.7);

      // ④ 珠：第一幕微亮，缠珠期被鳞光激起，第三幕留余晖。
      const pearlGlow = 0.25 * act1 + coilGain * 0.75 + act3 * 0.3;
      pearl.material.opacity = Math.min(1, pearlGlow);
      pearl.scale.setScalar(0.7 + coilGain * 0.35 + Math.sin(seconds * 5.4) * 0.04);
      halo.material.uniforms.uIntensity.value = Math.min(1.6, pearlGlow * 1.2 + act3 * 0.35);

      // 互动① 珠光沿鳞流走：一列沿链推进的亮头，强度由缠绕紧密度给。
      // 位置随时间走、强度随缠绕走——两者分开，所以「缠得紧才有光可流」。
      const head = ((seconds / FLOW_PERIOD) % 1) * SPINE_JOINT_COUNT;
      for (let i = 0; i < SPINE_JOINT_COUNT; i += 1) {
        // 环形距离：亮头绕到链尾后从链头接上，流光不断档。
        const raw = Math.abs(i - head);
        const ring = Math.min(raw, SPINE_JOINT_COUNT - raw);
        const near = Math.max(0, 1 - ring / 3.2);
        nodes[i].scale.material.uniforms.uFlow.value = Math.pow(near, 1.5) * coilGain;
      }

      // ⑤ 龙珠互绕：双环转速不同，半径随摆幅张开（互动③）。
      const orbitScale = orbitScaleFor(sway) * (0.5 + act1 * 0.5);
      for (let i = 0; i < orbits.length; i += 1) {
        const ring = orbits[i];
        ring.scale.setScalar(Math.max(0.001, orbitScale));
        ring.rotation.z = seconds * (i === 0 ? 1.9 : -1.35);
        ring.rotation.x = (i === 0 ? 1.02 : -0.74) + Math.sin(seconds * 0.9) * 0.22;
        ring.material.opacity = (0.3 * act1 + coilGain * 0.5) * (1 - act3 * 0.55);
      }

      // ⑦ 龙息：窗口内一次喷吐，火团从龙首沿链走向甩出。
      const breathWindow = BREATH_END - BREATH_START;
      const breathPhase = (t - BREATH_START) / breathWindow;
      const breathing = breathPhase > 0 && breathPhase < 1 ? Math.sin(breathPhase * Math.PI) : 0;
      const headJoint = joints[0];
      const reach = segment * (1.1 + breathing * 1.5);
      const breathX = headJoint.x + Math.cos(headJoint.angle) * reach;
      const breathY = headJoint.y + Math.sin(headJoint.angle) * reach;
      breath.position.set(breathX, breathY, 8);
      breath.rotation.z = headJoint.angle - Math.PI / 2;
      breath.scale.setScalar(Math.max(0.001, 0.3 + breathing * 0.95));
      breath.material.opacity = Math.pow(breathing, 0.8) * 0.9;

      // ③ 云海：第一幕成形，第三幕龙腾入云时回涌变厚。
      const cloudMaterial = cloud.material;
      cloudMaterial.uniforms.uTime.value = seconds;

      // 互动② 龙息推散云层：挖孔中心锁在火团实际位置（uv 空间），
      // 孔径随喷吐强度张开——云的空隙因此与火团同步，不是各自演。
      // 龙身自身也挤开一点云（规格③「云被龙身挤出空隙」）。
      const bodyCarve = bodyAlpha * 0.32;
      const gaps = Math.min(1, bodyCarve + breathing * 0.85);
      const gapX = breathing > 0.05 ? breathX : coil.x;
      const gapY = breathing > 0.05 ? breathY : coil.y;
      cloudMaterial.uniforms.uGaps.value = gaps;
      cloudMaterial.uniforms.uGapCenter.value.set(
        0.5 + gapX / (width * 1.3),
        0.5 + (gapY - cloud.position.y) / (height * 1.05),
      );
      cloudMaterial.uniforms.uGlow.value = coilGain * 0.6 + breathing * 0.9;
      // 密度被空隙压低：整层变薄与被挖孔是两件事，一并作用才像被推散。
      cloudMaterial.uniforms.uDensity.value =
        (0.35 + act1 * 0.65) * (1 - gaps * 0.42) * (1 + act3 * 0.25);

      // ⑧ 雾境：全程低密度铺底，末幕随龙入云略增，接住珠光余晖。
      mist.material.uniforms.uTime.value = seconds;
      mist.material.uniforms.uDensity.value = 0.4 * act1 + act3 * 0.35;

      // ⑥ 雨丝：稀疏斜雨，龙息与珠光经过处略被照亮。
      const litRadius = width * 0.2;
      for (const thread of rain) {
        const uniforms = thread.mesh.material.uniforms;
        uniforms.uAlpha.value = 0.3 * act1 * (1 - act3 * 0.5);
        const distance = Math.abs(thread.x - gapX);
        const proximity = Math.max(0, 1 - distance / litRadius);
        uniforms.uBright.value = proximity * Math.max(breathing * 0.8, coilGain * 0.3);
        thread.mesh.position.y = -((seconds * height * 0.55) % (height * 0.2));
      }
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'dragon',
    title: '腾龙戏珠',
    elements: ['龙身', '鳞光', '龙爪扰动云', '光珠', '龙珠互绕', '雨丝背景', '龙息', '雾境'],
    signature: '唯一"生物链+缠绕"场景；骨骼链 mesh 全库唯一',
    preset: 'wave',
  },
  createDragonStage,
);

export { createDragonStage };

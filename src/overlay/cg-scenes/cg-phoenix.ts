/**
 * 场景 02 phoenix（rise · 浴火重生，1200ms）。
 *
 * 三幕（规格 §4.2 场景 02）：
 * - 0–250ms   展翅亮翼
 * - 250–800ms 盘旋 + 火羽拖迹 + 云层撕裂
 * - 800–1200ms 爆燃成金雨、光柱退场
 *
 * 互动：①火羽在翼尖汇聚成羽（沿 wingPoint 轨迹推进，末端收束）；
 * ②金羽下落半程被余烬推升一次（featherFall 的重力反转）；
 * ③光柱在爆燃瞬间照亮云层（云的 uLit 由光柱强度派生，不是独立曲线）。
 * 热浪与云层撕裂同样共用一个强度源，所以「热浪推开云」是真耦合。
 *
 * 独立签名：**对称双翼 + 涅槃金雨**——左右翼由 wingPoint 同一套参数镜像
 * 生成（全库唯一的对称双翼构图）；金雨的重力反转让下落被托举一次。
 * 另有全库唯一的热浪折射屏幕效果（HEAT_HAZE_FRAGMENT）。
 *
 * 元素搭建在 ./phoenix-parts，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildPhoenixParts, wingPoint } from './phoenix-parts';
import { materialIdentityFor } from '../material-identity';

/** 第一幕结束点（250/1200）。 */
export const PHOENIX_ACT1_END = 250 / 1200;
/** 第二幕结束点（800/1200）。 */
export const PHOENIX_ACT2_END = 800 / 1200;

/** 余烬托举窗口：下落半程的一段窄窗，短促才像被气流顶了一下。 */
const LIFT_START = 0.42;
const LIFT_END = 0.58;
/** 托举幅度（归一化）：抵得过窗口内的下落速度，又不足以抹掉整段净下落。 */
const LIFT_AMOUNT = 0.34;

export type FeatherFall = {
  /** 归一化高度偏移（0 起点，负值向下）。 */
  y: number;
  /** 累积自转角（旋转渐落）。 */
  spin: number;
};

/**
 * 金羽下落轨迹（纯函数，便于直接验收签名）。
 *
 * 重力在 LIFT_START–LIFT_END 之间短暂反向：余烬把羽毛托起一次。
 * 位移用「分段积分后的闭式」而不是逐帧累加，因此同一 p 永远得到同一结果，
 * 测试可以对速度符号变化次数直接断言，不受采样步长影响。
 *
 * @param p 下落归一化进度
 */
export function featherFall(p: number): FeatherFall {
  const k = Math.min(1, Math.max(0, p));
  const span = LIFT_END - LIFT_START;
  // 主段：自由下落，二次曲线，速度 -2k 全程为负。
  const drop = -k * k;
  // 托举段：窗口内线性抬升，窗口后冻结为常量。
  // 线性的斜率在窗口内恒为 LIFT_AMOUNT/span，只要它大于窗口内的下落速度
  // 2*LIFT_END，净速度就在整个窗口内为正——于是符号恰好翻转两次
  // （入窗下→上、出窗上→下），「反转一次」是曲线的性质而非采样巧合。
  const window = k <= LIFT_START ? 0 : Math.min(1, (k - LIFT_START) / span);
  const lift = window * LIFT_AMOUNT;
  return { y: drop + lift, spin: k * Math.PI * 2.4 };
}

function createPhoenixStage(ctx: CgStageContext): CgStage {
  const parts = buildPhoenixParts(ctx);
  const { res, feathers, goldFeathers, wingSpan } = parts;
  const { width, height } = ctx;
  // 物理档案取 combustion 的数值项：燃烧素材的余烬托举强度与自转快慢
  // 由 restitution / resonance 决定，避免这里再拍一组魔法数。
  const { restitution, resonance } = materialIdentityFor('phoenix', 'rise', ctx.params).physical;
  const fallSpan = height * 1.15;

  // 粒子层：翼尖火羽拖迹 + 金雨余烬，档位与释放由工具层统一管。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 64,
    lifetime: [0.35, 0.9],
    speed: [wingSpan * 0.1, wingSpan * 0.34],
    size: [2.5, 7],
    color: ctx.color.clone(),
    shape: 'cone',
    spread: 0.42,
    position: new THREE.Vector3(wingSpan, 0, 0),
  });
  hub.emit({
    count: 48,
    lifetime: [0.5, 1.1],
    speed: [height * 0.05, height * 0.16],
    size: [2, 5.5],
    color: new THREE.Color('#FFD37A'),
    shape: 'sphere',
    spread: width * 0.4,
  });

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, PHOENIX_ACT1_END, PHOENIX_ACT2_END);
      // 盘旋：第二幕的横向摆动，躯干与双翼共用，翼才不会脱离身体。
      const circle = Math.sin(act2 * Math.PI * 2) * width * 0.12 * (1 - act3);
      const bodyY = height * (0.04 + act2 * 0.06) - act3 * height * 0.1;
      // 爆燃：第三幕的总闸，躯干散去、金雨与光柱起。
      const burst = Math.pow(act3, 0.8);

      // ① 双翼火羽：沿 wingPoint 轨迹展开，第三幕炸散。
      const open = Math.pow(act1, 0.7) * (1 - burst * 0.35);
      parts.wingPlume.position.set(circle, bodyY, 0);
      for (let i = 0; i < feathers.length; i += 1) {
        const f = feathers[i];
        // 逐片延迟展开：翼根先到位、翼尖最后甩开，展翅才有先后。
        const reach = Math.min(1, Math.max(0, open * 1.35 - f.k * 0.3));
        const flap = Math.sin(seconds * 7 + f.k * 2.2) * 0.14 * act1;
        for (const side of [1, -1] as const) {
          const p = wingPoint(f.k * reach, side, wingSpan);
          const mesh = side === 1 ? f.right : f.left;
          // 爆燃时翼羽沿轨迹继续外抛：翼「化」成金雨而不是原地消失。
          mesh.position.set(p.x * (1 + burst * 0.5), p.y + flap * wingSpan * 0.2 + burst * height * 0.12, 0);
          // 羽片朝向沿轨迹外法线，左右靠 side 取反保持镜像。
          mesh.rotation.z = side * (Math.PI * 0.5 - f.k * 0.9 - flap);
          mesh.scale.setScalar(0.4 + reach * 0.6);
          mesh.material.opacity = reach * (1 - burst) * 0.95;
        }
      }

      // ② 躯干 + ③ 火焰冠：盘旋幕在场，爆燃后散去。
      const bodyAlpha = Math.pow(act1, 1.2) * (1 - burst);
      parts.body.position.set(circle, bodyY, 0);
      parts.body.rotation.z = -circle / width * 0.9;
      parts.body.material.opacity = bodyAlpha * 0.9;
      // 火焰冠高频抖动（规格③）：频率远高于盘旋，才是「冠」在跳而非身体在动。
      const jitter = Math.sin(seconds * 34) * 0.5 + Math.sin(seconds * 51) * 0.3;
      parts.crown.position.set(
        circle + jitter * wingSpan * 0.02,
        bodyY + wingSpan * 0.33 + Math.abs(jitter) * wingSpan * 0.03,
        0,
      );
      parts.crown.scale.setScalar(0.8 + Math.abs(jitter) * 0.35);
      parts.crown.material.opacity = bodyAlpha * (0.55 + Math.abs(jitter) * 0.4);

      // ⑥ 热浪：盘旋幕起势，爆燃时最强——它同时是⑦撕裂量的来源。
      const heat = act1 * (0.25 + act2 * 0.5) + burst * 0.9;
      parts.haze.material.uniforms.uTime.value = seconds;
      parts.haze.material.uniforms.uRefract.value = heat;
      parts.haze.material.uniforms.uCenterY.value = 0.5 + bodyY / height;

      // ⑤ 涅槃光柱：爆燃瞬间冲起，随即退场（规格：光柱退场）。
      const pillar = Math.sin(Math.min(1, act3 * 1.25) * Math.PI) * 1.05;
      parts.pillar.position.x = circle * 0.4;
      parts.pillar.material.uniforms.uTime.value = seconds;
      parts.pillar.material.uniforms.uIntensity.value = pillar;

      // ⑦ 云层撕裂：uRift 由热浪派生（互动·热浪推开云），
      // uLit 由光柱强度派生（互动·光柱照亮云层）——两条都不是独立曲线。
      const cloudMat = parts.cloud.material;
      cloudMat.uniforms.uTime.value = seconds;
      cloudMat.uniforms.uDensity.value = 0.85 * (1 - burst * 0.3);
      cloudMat.uniforms.uRift.value = heat * 0.85;
      cloudMat.uniforms.uLit.value = pillar * 0.9;

      // ④ 金羽雨：爆燃后落下，半程被余烬托升一次（签名）。
      for (let i = 0; i < goldFeathers.length; i += 1) {
        const g = goldFeathers[i];
        // 各羽错开起落，但共用同一条 featherFall，托举因此整场同构。
        const p = Math.min(1, Math.max(0, (burst - g.delay) / Math.max(0.05, 1 - g.delay)));
        const fall = featherFall(p);
        g.mesh.position.set(
          // 横向随余烬轻飘，托举段飘得更明显：托升是气流干的。
          g.x + Math.sin(seconds * 1.6 + i) * width * 0.02 * restitution * 4,
          g.startY + fall.y * fallSpan,
          0,
        );
        g.mesh.rotation.z = fall.spin * resonance * 1.4 + i;
        g.mesh.material.opacity = p > 0 ? Math.sin(Math.min(1, p * 1.15) * Math.PI) * 0.95 : 0;
      }

      // ⑧ 冲击羽环形波：爆燃点向外推的双层环，外层跑得更快更薄。
      for (let i = 0; i < parts.rings.length; i += 1) {
        const ring = parts.rings[i];
        const lead = i ? 1.3 : 1;
        ring.position.set(circle * 0.3, bodyY, 0);
        ring.scale.setScalar(0.05 + burst * 1.5 * lead);
        ring.material.opacity = Math.sin(Math.min(1, burst * 1.1) * Math.PI) * (i ? 0.45 : 0.8);
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
    packId: 'phoenix',
    title: '浴火重生',
    elements: [
      '双翼火羽', '凤凰躯干', '头顶火焰冠', '金羽雨',
      '涅槃光柱', '热浪扭曲层', '云层撕裂', '冲击羽环形波',
    ],
    signature: '唯一"对称双翼+涅槃金雨"；热浪折射屏幕效果全库唯一',
    preset: 'rise',
  },
  createPhoenixStage,
);

export { createPhoenixStage };

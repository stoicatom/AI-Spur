/**
 * 场景 10 ice（shatter-ice · 极寒暴雪原野，1200ms）。
 *
 * 三幕（规格 §4.2 场景 10）：
 * - 0–250ms   风暴蓄势：雪幕自屏幕两侧压入
 * - 250–800ms 冰晶炸裂 + 风刀雪幕：冰棱飞散、地面裂纹推进
 * - 800–1200ms 寒雾收拢 + 余雪
 *
 * 互动：①冰晶炸开在爆点生成涡旋，扰动雪幕（近爆点雪粒被拽得比远处远）；
 * ②地面冰裂纹前沿与冰棱落地同步——前沿扫到哪一段，那一段的冰棱才砸下。
 * 两者共用 shatter 这一个进度源，因此耦合是真的而非各演各的。
 *
 * 独立签名：**两层视差风切雪幕**——远近两层雪粒共用同一个扫掠风场，
 * 乘不同 parallax 系数使近景快于远景。全库其余环境场都是单层，
 * 只有此处是「一套风、两种速度」；配套的冰裂纹前沿扩散亦为全库唯一。
 *
 * 元素搭建在 ./ice-parts 与 ./ice-veil，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { Body } from 'cannon-es';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildIceParts } from './ice-parts';
import { driveSnowLayer } from './ice-veil';
import { iceWindField } from './ice-wind';

const TOTAL_MS = 1200;
/** 第一幕结束点（250/1200）。 */
export const ICE_ACT1_END = 250 / TOTAL_MS;
/** 第二幕结束点（800/1200）。 */
export const ICE_ACT2_END = 800 / TOTAL_MS;

/** 物理固定步长，与 bomb/skull 一致，保证确定性重放。 */
const PHYSICS_STEP = 1 / 60;
/** 单帧最多补齐的步数：防止极端跳帧时一次 update 里跑满整幕物理。 */
const MAX_PHYSICS_CATCHUP = 240;
/** 第二三幕合计时长（秒），冰棱飞行时间的量纲基准。 */
const ICE_DURATION_S = 1.9 * (1 - ICE_ACT1_END);
/** 风刀与涡旋的持续秒数 = 第二幕时长，两者同生同灭。 */
const VORTEX_SPAN_S = 1.9 * (ICE_ACT2_END - ICE_ACT1_END);

/**
 * 风向扫掠曲线（纯函数，便于直接验收签名）。
 *
 * 从偏下的迎面风扫到偏上的侧风：一场风暴里风向本来就在转，
 * 定向风会让满屏雪粒像一张平移的贴图。
 *
 * @param t 归一化总进度
 */
export function windAngle(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  // 基准朝向指向屏幕左下（雪被横风压着走），叠一个整幕单向扫掠 +
  // 一次轻微回摆，避免匀速转动显得像机械扫描。
  return Math.PI * 1.12 + k * 0.85 + Math.sin(k * Math.PI * 2) * 0.12;
}

function createIceStage(ctx: CgStageContext): CgStage {
  const parts = buildIceParts(ctx);
  const { res, near, far, burst, floorY } = parts;
  const { width, height } = ctx;
  const short = Math.min(width, height);

  // 粒子层（规格元素①的飞散雪沫 + ④炸裂冰屑）：Points 雪幕表达「一场雪」，
  // 炸点飞溅的颗粒是一次性爆发，交给 quarks 更合适，档位与释放由工具层统一管。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 90,
    lifetime: [0.3, 0.85],
    speed: [short * 0.35, short * 1.05],
    size: [2, 5.5],
    color: new THREE.Color('#EAF6FF'),
    shape: 'sphere',
    spread: short * 0.05,
    position: new THREE.Vector3(burst.x, burst.y, 12),
  });
  hub.emit({
    count: 70,
    lifetime: [0.7, 1.4],
    speed: [short * 0.12, short * 0.4],
    size: [1.4, 3],
    color: new THREE.Color('#BBD9F5'),
    shape: 'sphere',
    spread: width * 0.5,
    looping: true,
    rate: 50,
  });

  let lastNow = ctx.now;
  const startNow = ctx.now;
  /** 物理世界已推进的秒数，用于按场景时间轴补齐固定步长。 */
  let physicsElapsed = 0;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      // 雪幕位移按「自场景起始的绝对秒数」算：跳帧调用也能重现同一画面。
      const elapsed = Math.max(0, (now - startNow) / 1000);
      const [act1, act2, act3] = acts(t, ICE_ACT1_END, ICE_ACT2_END);
      // 冰晶炸裂进度：第二幕的唯一驱动量，涡旋、裂纹、冰棱全挂在它上面。
      const shatter = act2;

      // ② 风力切变：风向随时间扫掠，风纹带把它显示出来。
      const angle = windAngle(t);
      parts.shear.rotation.z = angle;
      // 风力在主幕最强（风刀），蓄势幕在积累、尾幕在衰减。
      const gust = 0.35 + act1 * 0.45 + Math.sin(shatter * Math.PI) * 0.5 - act3 * 0.5;
      parts.shear.material.opacity = Math.max(0, gust) * 0.3;
      parts.shear.position.set(
        Math.cos(angle) * width * 0.06,
        Math.sin(angle) * height * 0.12,
        20,
      );

      // 互动①：冰晶炸开生成涡旋。整幕只构造这**一个** WindField，
      // 两层雪幕共用它——互动因此是「同一份运行时真值」而非两条曲线。
      const vortex = iceWindField({
        angle, elapsed, act1, act3, short,
        burstX: burst.x, burstY: burst.y, vortexSpan: VORTEX_SPAN_S,
        vortexStart: ICE_ACT1_END * 1.9,
      });

      // ① 两层视差雪幕（签名）：同一风场，近景层系数 1、远景层 0.42。
      driveSnowLayer(near, vortex, elapsed);
      driveSnowLayer(far, vortex, elapsed);
      // 「自两侧压入」由 WindField.gather 逐粒完成（见 ice-veil），
      // 这里**不**动整层 scale：压缩整层会把粒子间距一并压扁，
      // 雪反而全挤到画面中央、屏缘无雪，与「两侧压入」正好相反。
      near.points.material.opacity = 0.5 + act1 * 0.42 - act3 * 0.3;
      far.points.material.opacity = 0.3 + act1 * 0.28 - act3 * 0.18;

      // ③ 寒雾：蓄势幕起雾，尾幕收拢（浓度回升、层间聚拢）。
      for (let i = 0; i < parts.fogLayers.length; i += 1) {
        const layer = parts.fogLayers[i];
        const uniforms = layer.mesh.material.uniforms;
        uniforms.uTime.value = seconds * layer.drift;
        // 主幕雾被风刀吹薄，尾幕重新拢起来：这就是「寒雾收拢」。
        uniforms.uDensity.value = act1 * (0.55 - shatter * 0.22 + act3 * 0.6);
        uniforms.uFlash.value = Math.pow(Math.max(0, 1 - Math.abs(shatter - 0.12) / 0.12), 2) * 0.5;
        // 层间错位漂移：横向速度差是体积感的来源。
        layer.mesh.position.x = Math.cos(angle) * width * 0.03 * layer.drift * (1 + act3);
        layer.mesh.position.y = -height * 0.06 * i + act3 * height * 0.04 * layer.drift;
      }

      // ④ 冰晶虹吸：蓄势幕晶核生长，主幕炸开后被风卷起持续抬升。
      const grow = Math.pow(act1, 0.8) * (1 + shatter * 0.5);
      parts.siphon.scale.set(0.25 + grow * 0.9, 0.25 + grow * 1.05, 1);
      // 被风卷起：抬升量在主幕末段接手、尾幕继续走，不是原地缩放。
      const lift = Math.pow(shatter, 1.4) * height * 0.16 + act3 * height * 0.26;
      parts.siphon.position.set(
        burst.x + Math.cos(angle) * lift * 0.5,
        burst.y + lift,
        10,
      );
      parts.siphon.rotation.z = seconds * 1.1 + shatter * 2.2;
      parts.siphonCore.material.opacity = Math.min(1, act1 * 0.9) * (1 - act3 * 0.75);
      for (let i = 0; i < parts.siphonBlades.length; i += 1) {
        const blade = parts.siphonBlades[i];
        // 叶片错峰亮起：六片同时满亮会像一枚贴图星标。
        const stagger = (i / parts.siphonBlades.length) * 0.35;
        blade.material.opacity = Math.max(0, act1 - stagger) * 1.1 * (1 - act3 * 0.8);
      }

      // ⑤⑦ 互动②：裂纹前沿与冰棱落地共用 shatter，前沿扫到哪就抛哪一段的冰棱。
      const front = Math.pow(shatter, 0.7);
      parts.cracks.material.uniforms.uSpread.value = front;
      parts.cracks.material.uniforms.uGlow.value = Math.min(1, shatter * 3) * (1 - act3 * 0.45);

      for (const icicle of parts.icicles) {
        // 该根落点对应的前沿位置：越靠屏缘要越晚的前沿才扫到。
        const reach = Math.abs(icicle.landX) / (width * 0.65);
        if (!icicle.released && shatter > 0 && front >= reach && shatter >= icicle.releaseAt) {
          icicle.released = true;
          icicle.body.type = Body.DYNAMIC;
          // 质量在构建时已给好，这里只让 cannon 重算惯性张量。
          icicle.body.updateMassProperties();
          icicle.body.wakeUp();
          // 横向速度按落点距离给，竖直留一点上抛形成抛物线顶点再被重力砸下。
          const flightTime = 0.34;
          icicle.body.velocity.set(
            (icicle.landX - burst.x) / flightTime,
            height * 0.22,
            0,
          );
          icicle.body.angularVelocity.set(0, 0, (reach - 0.5) * 16);
        }
        icicle.mesh.material.opacity = icicle.released
          ? 0.85 * (1 - act3 * 0.55)
          : Math.min(0.5, act1 * 0.5);
      }

      // 物理由**场景时间轴**驱动而非 frameDelta：后者为防跳帧压在 50ms 上限，
      // 而 update 可能以任意 t 稀疏调用（跨 500ms 只推进 50ms，冰棱永远落不了地）。
      // 按 t 折算目标时长再以固定步长补齐，同时满足 R-PERF-001 的确定性。
      const physicsTarget = Math.max(0, (t - ICE_ACT1_END)) * ICE_DURATION_S;
      let guard = 0;
      while (physicsElapsed + PHYSICS_STEP <= physicsTarget && guard < MAX_PHYSICS_CATCHUP) {
        parts.world.step(PHYSICS_STEP);
        physicsElapsed += PHYSICS_STEP;
        guard += 1;
      }

      for (const icicle of parts.icicles) {
        if (!icicle.released) continue;
        const p = icicle.body.position;
        // 落地夹紧：cannon 的 Plane 只挡穿透，不给夹紧会在地面附近抖。
        icicle.mesh.position.set(p.x, Math.max(floorY, p.y), p.z);
        const q = icicle.body.quaternion;
        icicle.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }

      // ⑥ 霜白闪光：炸裂瞬间的整屏冷白，窄窗开在第二幕最早段，蓄势幕不亮。
      const burstFlash = shatter > 0 ? Math.max(0, 1 - shatter * 6.5) : 0;
      parts.flash.material.opacity = Math.pow(burstFlash, 1.3) * 0.85;

      // ⑧ 极光带：全幕微光，主幕被雪幕压暗，尾幕雪散后重新透出来。
      const auroraUniforms = parts.aurora.material.uniforms;
      auroraUniforms.uTime.value = seconds;
      auroraUniforms.uAlpha.value = (0.3 + act1 * 0.4) * (1 - shatter * 0.35) + act3 * 0.3;
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      // 刚体先摘干净：World 无 dispose，留着 body 会让 broadphase 持有引用。
      while (parts.world.bodies.length > 0) parts.world.removeBody(parts.world.bodies[0]);
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'ice',
    title: '极寒暴雪原野',
    elements: ['狂风雪幕', '风力切变', '寒雾', '冰晶虹吸', '地面冰裂纹', '霜白闪光', '冰棱飞散', '极光带'],
    signature: '唯一"两层视差风切雪幕"；冰裂纹扩散全库唯一',
    preset: 'shatter-ice',
  },
  createIceStage,
);

export { createIceStage };

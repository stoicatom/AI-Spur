/**
 * 场景 35 glass-shot（glass-break · 子弹击碎玻璃，1550ms）。
 *
 * 三幕（规格 §4.2 场景 35）：
 * - 0–300ms   子弹曳光飞行（玻璃仍完整，裂纹尚不存在）
 * - 300–900ms 白斑 → 裂纹 → 孔洞 → 碎落
 * - 900–1550ms 碎片落地、碎渣停住
 *
 * 时序因果是本场景的骨架：命中之前一根裂纹都不许出现，
 * 命中那一帧白斑先炸、裂纹前沿再从孔口向外扫，碎片按前沿扫过的顺序脱落。
 *
 * 互动：①裂纹前沿抵达某片所在半径时该片才脱落（外圈先落）；
 * ②子弹贯穿瞬间 uHole 台阶跃变，裂纹孔即时扩大。两者共用同一个前沿量，
 * 所以耦合是真的——不是两条各演各的曲线。
 *
 * 独立签名：**全屏介质被击碎**——玻璃板覆盖整屏，
 * 崩解是靠 shader 的面积丢失 + 刚体抽离共同完成，全库只有这一处。
 *
 * 元素搭建在 ./glass-shot-parts 与 ./glass-shot-shatter，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { Body } from 'cannon-es';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildGlassShotParts } from './glass-shot-parts';

const TOTAL_MS = 1550;
/** 三幕边界（归一化，对应 1550ms）。 */
const ACT1_END = 300 / TOTAL_MS;
const ACT2_END = 900 / TOTAL_MS;

/** 刚体最大子步：帧率抖动时物理不失稳，也不吞掉整帧位移。 */
const MAX_SUBSTEPS = 4;

function createGlassShotStage(ctx: CgStageContext): CgStage {
  const parts = buildGlassShotParts(ctx);
  const { res, impact, span, world } = parts;

  // 弹道：从左下飞向冲击点，第一幕沿这条线推进，贯穿后延同向出屏。
  const entry = new THREE.Vector2(impact.x - ctx.width * 0.62, impact.y - ctx.height * 0.3);
  const flightDir = new THREE.Vector2().subVectors(impact, entry).normalize();
  const flightAngle = Math.atan2(flightDir.y, flightDir.x);
  parts.exitLine.rotation.z = flightAngle;
  parts.tracer.rotation.z = flightAngle - Math.PI / 2;
  parts.tracerHeat.rotation.z = flightAngle + Math.PI;

  // 粒子层：命中飞溅的玻璃屑 + 弹道热屑，档位与释放由工具层统一管。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 70,
    lifetime: [0.35, 0.95],
    speed: [span * 0.25, span * 0.85],
    size: [1.8, 4.6],
    color: new THREE.Color('#DCF2FF'),
    shape: 'cone',
    spread: 0.55,
    position: new THREE.Vector3(impact.x, impact.y, 16),
  });
  hub.emit({
    count: 34,
    lifetime: [0.25, 0.6],
    speed: [span * 0.1, span * 0.4],
    size: [1.4, 3.2],
    color: new THREE.Color('#FFE1AE'),
    shape: 'sphere',
    spread: span * 0.06,
    position: new THREE.Vector3(impact.x, impact.y, 16),
  });

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, ACT1_END, ACT2_END);
      const hit = t >= ACT1_END;

      // ① 子弹曳光：第一幕沿弹道推进，命中即隐（弹体已入板）。
      const flight = act1 * act1 * 0.5 + act1 * 0.5; // 略加速，末段更快撞上
      const pos = entry.clone().lerp(impact, flight);
      parts.tracer.parent!.position.set(pos.x, pos.y, 24);
      const tracerAlpha = hit ? 0 : 1;
      parts.tracer.material.opacity = tracerAlpha;
      parts.tracerHeat.material.uniforms.uProgress.value = act1;
      parts.tracerHeat.material.uniforms.uIntensity.value = tracerAlpha * (0.3 + act1 * 0.7);

      // ⑧ 贯穿线：命中后才留下，随后缓慢褪去。
      parts.exitLine.material.opacity = hit ? 0.7 * (1 - act3 * 0.85) : 0;

      // ③ 白斑：命中瞬间最亮，60ms 量级内衰掉，所以用 act2 的极早段。
      const bloomK = hit ? Math.max(0, 1 - act2 * 7) : 0;
      parts.bloom.material.opacity = bloomK;
      parts.bloom.scale.setScalar(0.5 + (1 - bloomK) * 2.4);

      // ②④⑤ 裂纹前沿：命中后从孔口向外扫，是本场景全部因果的驱动量。
      const front = hit ? Math.min(1.05, Math.pow(act2, 0.62) * 1.05) : 0;
      const web = parts.webMaterial.uniforms;
      web.uFront.value = front;
      // 互动②：贯穿是瞬时事件，孔径台阶跃变而非缓坡。
      web.uHole.value = hit ? Math.min(1, 0.32 + act2 * 0.68) : 0;
      web.uFine.value = hit ? Math.min(1, act2 * 1.6) * (1 - act3 * 0.5) : 0;

      // ④ 主裂纹逐条按前沿显形：越长的纹要更靠后的前沿才撕到底。
      for (let i = 0; i < parts.radials.length; i += 1) {
        const mesh = parts.radials[i];
        const reach = 0.16 + (i % 5) * 0.045;
        mesh.material.opacity = hit ? Math.min(1, Math.max(0, (front - reach) * 4.5)) * (1 - act3 * 0.55) : 0;
      }
      for (let i = 0; i < parts.rings.length; i += 1) {
        const mesh = parts.rings[i];
        const reach = 0.2 + i * 0.16;
        mesh.material.opacity = hit ? Math.min(0.85, Math.max(0, (front - reach) * 4)) * (1 - act3 * 0.6) : 0;
      }
      // ⑤ 孔洞拉丝：跟孔径同步，第三幕随孔缘崩掉而消失。
      for (const mesh of parts.stress) {
        mesh.material.opacity = hit ? Math.min(0.9, act2 * 3) * (1 - act3) : 0;
      }

      // ② 玻璃完整度：前沿扫过的面积逐步丢失，末幕整板见空。
      parts.paneMaterial.uniforms.uShatter.value = hit ? Math.min(1, front * 0.55 + act3 * 0.6) : 0;
      parts.paneMaterial.uniforms.uSheen.value = 1 - act3 * 0.7;

      // ⑥ 碎片：互动①——前沿抵达该片半径才转为动态刚体。
      for (const shard of parts.shards) {
        const norm = shard.radius / span;
        if (!shard.released && hit && front >= shard.releaseAt) {
          shard.released = true;
          shard.body.type = Body.DYNAMIC;
          // 质量在构建时已按环带给好，这里只需让 cannon 重算惯性张量。
          shard.body.updateMassProperties();
          shard.body.wakeUp();
          // 初速只有「面内小幅外扩 + 朝屏外」：竖直板上的碎片一脱落就归重力管，
          // 给向上的初速会把重力抵掉，看着像在飘。
          const away = Math.max(0.001, shard.radius);
          shard.body.velocity.set(
            ((shard.mesh.position.x - impact.x) / away) * span * 0.16,
            0,
            span * 0.06,
          );
          shard.body.angularVelocity.set(shard.glintPhase - 3, shard.glintPhase - 3, shard.glintPhase);
        }
        // 裂纹前沿扫过这片就先亮出断口，脱落与否是另一回事。
        shard.mesh.material.opacity = hit ? Math.min(1, 0.25 + Math.max(0, front - norm) * 5) : 0;
      }

      if (hit && delta > 0) world.step(1 / 60, delta, MAX_SUBSTEPS);

      // 刚体位姿回写显示体：只有已释放的片跟随物理，未释放的仍贴在板上。
      for (const shard of parts.shards) {
        if (!shard.released) continue;
        const p = shard.body.position;
        shard.mesh.position.set(p.x, p.y, p.z);
        const q = shard.body.quaternion;
        shard.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }

      // ⑦ 碎片反光：贴到已释放的片上，闪相错峰形成一片碎光。
      for (let i = 0; i < parts.glints.length; i += 1) {
        const glint = parts.glints[i];
        const shard = parts.shards[i % parts.shards.length];
        if (!shard.released) { glint.material.opacity = 0; continue; }
        glint.position.set(shard.mesh.position.x, shard.mesh.position.y, 14);
        glint.rotation.z = shard.glintPhase + seconds * 2.4;
        const flash = Math.max(0, Math.sin(seconds * 7 + shard.glintPhase));
        glint.material.opacity = Math.pow(flash, 3) * 0.8 * (1 - act3 * 0.35);
      }

      // ⑨ 地面碎渣：第三幕逐渐堆起来，是碎落有终点的收束信号。
      for (let i = 0; i < parts.grit.length; i += 1) {
        const mesh = parts.grit[i];
        const stagger = (i % 7) / 7;
        mesh.material.opacity = Math.min(0.85, Math.max(0, (act3 - stagger * 0.35) * 2.2));
      }
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      // 刚体先摘干净：World 无 dispose，留着 body 会让 broadphase 持有引用。
      for (const shard of parts.shards) world.removeBody(shard.body);
      while (world.bodies.length > 0) world.removeBody(world.bodies[0]);
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'glass-shot',
    title: '子弹击碎玻璃',
    elements: ['子弹曳光', '玻璃板', '白斑炸点', '蛛网裂纹', '孔洞拉丝', '玻璃碎片', '碎片反光', '弹道贯穿线', '地面碎渣'],
    signature: '唯一"全屏介质被击碎"；白斑→裂纹→孔洞→碎落的时序全库唯一',
    preset: 'glass-break',
  },
  createGlassShotStage,
);

export { createGlassShotStage };

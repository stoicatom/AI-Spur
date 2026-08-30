/**
 * 场景 13 wind（whirl · 风旋尘卷，1200ms）。
 *
 * 三幕（规格 §4.2 场景 13）：
 * - 0–250ms    气旋成形：尘卷自地面拧起、砂纹初现
 * - 250–900ms  卷扬 + 枯叶：满力旋转、枯叶沿螺旋线上升、风眼张开
 * - 900–1200ms 减弱 + 沙沉：角速度回落、尘与叶沉降
 *
 * 互动：①枯叶沿尘卷螺旋线上升——叶片刚体受的气流速度取自**同一个** WhirlField，
 * 且向心目标半径与尘卷 mesh 共用 funnelRadiusAt 剖面，叶子因此贴着漏斗壁盘旋而上；
 * ②砂纹随风力增强——砂纹 shader 的 uStrength 直接吃 WhirlField.gust，
 * 脊线密度与沟深都由它一个量驱动。两条互动共用同一份运行时真值，不是各演各的。
 *
 * 独立签名：**唯一「旋转流场」环境**——涡不是插曲而是主流：涡内粒子位置
 * 完全由绕轴累计转角决定（不叠加平流），角速度取 Rankine 剖面（刚体核 + 自由涡），
 * 且涡轴整幕横扫全屏宽。配套的枯叶薄片刚体环绕轨迹亦为全库唯一。
 *
 * 元素搭建在 ./wind-parts，风场数学在 ./wind-field，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildWindParts } from './wind-parts';
import { driveDustLayer } from './wind-streams';
import { whirlField, windBeat, WHIRL_SPAN_S, type WhirlField } from './wind-field';

const TOTAL_MS = 1200;
/** 第一幕结束点（250/1200）。 */
export const WIND_ACT1_END = 250 / TOTAL_MS;
/** 第二幕结束点（900/1200）。 */
export const WIND_ACT2_END = 900 / TOTAL_MS;

function createWindStage(ctx: CgStageContext): CgStage {
  const parts = buildWindParts(ctx);
  const { res, funnelHeight } = parts;
  const { width, height } = ctx;
  const short = Math.min(width, height);

  // 粒子层：①的高速流线拖尾用 quarks（一次性沿风飞出的丝线），
  // 与 Points 尘幕互补——尘幕表达「满屏的沙」，quarks 表达「被抽出的丝」。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 120,
    lifetime: [0.35, 0.95],
    speed: [short * 0.5, short * 1.3],
    size: [1.6, 4.2],
    color: new THREE.Color('#F5E4BE'),
    shape: 'cone',
    spread: 0.5,
    position: new THREE.Vector3(0, parts.floorY + height * 0.1, 18),
  });
  hub.emit({
    count: 80,
    lifetime: [0.6, 1.3],
    speed: [short * 0.15, short * 0.55],
    size: [1.2, 2.8],
    color: new THREE.Color('#D6BE93'),
    shape: 'sphere',
    spread: width * 0.45,
    looping: true,
    rate: 55,
  });

  let lastNow = ctx.now;

  /**
   * 场景时间（秒）→ 该时刻的风场，整幕**唯一**的风场真值来源。
   *
   * 时间基准取**归一化进度 t** 而非墙上时钟 `now`：t 是场景时间轴的定义，
   * 而刚体积分需要在 t 的中间时刻求风（补齐固定步时逐步取值）——
   * 那些中间时刻只存在于场景时间轴上。以 t 为基准后，同一 t 永远画出同一帧，
   * 稀疏调用与逐帧调用得到一致结果（R-PERF-001 的确定性要求）。
   */
  function fieldAt(sceneSeconds: number): WhirlField {
    const progress = Math.min(1, Math.max(0, sceneSeconds / WHIRL_SPAN_S));
    const [a1, , a3] = acts(progress, WIND_ACT1_END, WIND_ACT2_END);
    // 成形度先算再造风场：漏斗壁剖面要用它，枯叶的向心目标半径与
    // 尘卷 mesh 的 uForm 因此是**同一个**量，叶子不会浮在漏斗外。
    const form = Math.min(1, a1) * (1 - a3 * 0.55);
    return whirlField({ elapsed: sceneSeconds, t: progress, act3: a3, form, width, height });
  }

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      // shader 的纹理滚动用墙上时钟（纯装饰，不影响任何可测状态）。
      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, WIND_ACT1_END, WIND_ACT2_END);
      // 场景时间：风场、频闪、刚体全部挂在它上面，同一 t 唯一决定画面。
      const elapsed = Math.min(1, Math.max(0, t)) * WHIRL_SPAN_S;

      // 整幕**唯一**的风场真值：尘幕、枯叶、砂纹、风眼全部消费它。
      const wind = fieldAt(elapsed);
      const form = wind.form;
      const beat = windBeat(elapsed);

      // ①④ 两层尘粒：同一涡、不同流场系数（流线 1、贴地尘 0.55）。
      driveDustLayer(parts.streams, wind, elapsed);
      driveDustLayer(parts.ground, wind, elapsed);
      // ⑧ 风声频闪把节奏打在尘粒密度上：透明度随 beat 起伏，
      // 视觉读数就是「一阵一阵」的尘量变化。
      parts.streams.points.material.opacity =
        (0.34 + act1 * 0.42) * (0.62 + beat * 0.38) * (1 - act3 * 0.62);
      parts.ground.points.material.opacity =
        (0.26 + act1 * 0.34) * (0.7 + beat * 0.3) * (1 - act3 * 0.4);

      // 涡轴横扫全屏（签名的「全屏」部分）：尘卷与风眼是它的子节点，
      // 移动轴一处即可，两个 mesh 不会因为漏改而错位。
      parts.axis.position.set(wind.axisX, wind.axisY, 0);

      // ② 尘卷：SDF 纹路吃累计转角。
      const funnelUniforms = parts.funnel.material.uniforms;
      funnelUniforms.uSpin.value = wind.spin;
      funnelUniforms.uForm.value = form;
      funnelUniforms.uDensity.value = (0.32 + wind.gust * 0.6) * (1 - act3 * 0.5);

      // ⑥ 风眼：主幕张开、尾幕闭合（位置由涡轴带着走）。
      const eyeUniforms = parts.eye.material.uniforms;
      eyeUniforms.uSpin.value = wind.spin;
      // 张开滞后于成形：气旋先有尘壁，眼是壁立起来之后才空出来的。
      eyeUniforms.uOpen.value = Math.max(0, act2 * 1.15 - act3 * 0.9) * (0.4 + wind.gust * 0.6);

      // ⑤ 互动②：砂纹随风力增强。uStrength 直接吃 gust —— 一个真值，
      // shader 内部再折算成脊线密度与沟深，语义不会在传递中被抹平。
      const rippleUniforms = parts.ripples.material.uniforms;
      rippleUniforms.uTime.value = seconds;
      rippleUniforms.uStrength.value = wind.gust * (0.35 + act1 * 0.65);
      rippleUniforms.uAngle.value = wind.angle;
      // 涡轴的归一化位置：砂纹脊线绕它弯曲，两者因此不是两张无关的图。
      (rippleUniforms.uAxis.value as THREE.Vector2).set(
        wind.axisX / (width * 0.625),
        (wind.axisY - parts.ripples.position.y) / (height * 0.31),
      );

      // ⑦ 云层快速掠过：两层反向速度横移。云被同一场风推着走，
      // 所以位移也用 wind.drift（已积分），不是各自乘时间。
      for (let i = 0; i < parts.cloudLayers.length; i += 1) {
        const layer = parts.cloudLayers[i];
        const uniforms = layer.mesh.material.uniforms;
        uniforms.uTime.value = seconds * layer.rush;
        uniforms.uDensity.value = 0.3 + act1 * 0.42 - act3 * 0.22;
        uniforms.uFlash.value = wind.gust * 0.24;
        // 掠过方向与环境风一致；层间 rush 系数拉开速度差形成纵深。
        const shift = wind.drift * layer.rush * 0.55;
        layer.mesh.position.x = ((shift + width) % (width * 1.8)) - width * 0.9;
      }

      // ③ 互动①：枯叶沿尘卷螺旋线上升。刚体由**场景时间轴**驱动而非
      // frameDelta：后者为防跳帧压在 50ms 上限，而 update 可能以任意 t
      // 稀疏调用（跨 500ms 只推进 50ms，叶子永远升不起来）。
      parts.leafField.update(fieldAt, elapsed);
      parts.leafField.setOpacity(0.55 + act1 * 0.4 - act3 * 0.3);

      // ⑧ 风声频闪的整屏薄膜：主幕最明显（风声最烈），首尾几乎不闪。
      parts.strobe.material.opacity = beat * wind.gust * 0.085;

      // 尾幕沙沉：尘卷随沙一起塌下去一点，底边仍踩在砂纹上。
      parts.funnel.position.y =
        parts.floorY + funnelHeight * 0.5 - parts.axisY - wind.settle * 0.35;
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      // 刚体先摘干净：World 无 dispose，留着 body 会让 broadphase 持有引用。
      parts.leafField.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'wind',
    title: '风旋尘卷',
    elements: ['风场流线', '尘卷', '被卷起的枯叶', '扬尘幕', '地面砂纹', '风眼', '云层快速掠过', '风声频闪'],
    signature: '唯一"旋转流场"环境；枯叶薄片刚体环绕轨迹全库唯一',
    preset: 'whirl',
  },
  createWindStage,
);

export { createWindStage };

/**
 * 场景 13 wind 的枯叶气动模型：给定风场与叶片状态，求它受的气流速度。
 *
 * 从 wind-leaves 分出来，一是 CLAUDE.md 的 250 行上限，二是这里回答的是
 * 「一片叶子在旋风的哪个位置感受到什么气流」——一个**纯函数式的力学问题**，
 * 只读刚体状态、只写一个输出向量，不建世界、不加刚体、不同步 mesh。
 * wind-leaves 的其余部分全是「建物理世界并逐帧同步位姿」的副作用代码。
 * 两类混在一处，读者无法一眼分辨哪部分是可推理的力学基座。
 */
import type { Body, Vec3 } from 'cannon-es';
import { funnelRadiusAt, swirlFalloff, type WhirlField } from './wind-field';

/**
 * 气动耦合系数（1/s）：叶片速度趋近气流速度的速率。
 *
 * 枯叶面积大质量小，跟风极快但不是瞬时——取 9 使时间常数约 0.11s，
 * 肉眼能看出叶子在拐弯处「甩」出去一点再被拉回漏斗壁。
 */
export const AERO_K = 9;

/**
 * 求叶片处的气流速度：切向 + 向心 + 上升，三者共用同一 falloff。
 *
 * 涡是一根**竖直柱**，所以半径量的是**水平**距离 hypot(x−axis, z)，高度 y 独立。
 * 早先按 2D 距离（把高度算进半径）求过一版：贴地的叶子因为离轴心「远」
 * 而拿到极弱的上升气流，永远趴在地上不动——那不是参数没调好，
 * 是把柱体当成了平面涡。
 *
 * @param wind 当帧风场（整幕唯一真值）
 * @param body 叶片刚体，位置与速度都要读（向心项依赖实际切向速度）
 * @param ambient 涡外的环境风速标尺（世界单位/秒）
 * @param out 输出气流速度，原地改写以免每步分配
 */
export function leafAirVelocity(
  wind: WhirlField, body: Body, ambient: number, out: Vec3,
): void {
  const p = body.position;
  const dx = p.x - wind.axisX;
  const dz = p.z;
  const r = Math.hypot(dx, dz);
  const falloff = swirlFalloff(r, wind.coreRadius, wind.reach);
  if (falloff <= 1e-4 || r < 1e-3) {
    // 涡外只有环境风：叶子被吹着走但不再盘。
    out.set(Math.cos(wind.angle) * wind.gust * ambient, 0, 0);
    return;
  }
  // 切向速度 = ω(r)·r，绕竖轴逆时针（xz 平面内 (−z, x)/r）。
  // 整根柱子还随涡轴横扫，故再叠 axisVx——叶子跟着尘卷走，不被留在原地。
  const omega = wind.omega * falloff;
  const tangential = omega * r;
  // 向心：目标半径取与尘卷 mesh **同一**剖面函数与同一份尺寸参数
  // （funnelHalfWidth / funnelSpan 都由 form 驱动），
  // 否则叶子会浮在漏斗外，「沿尘卷螺旋线上升」就成了空话。
  const hNorm = (p.y - wind.funnelBaseY) / Math.max(1, wind.funnelSpan);
  const wall = funnelRadiusAt(hNorm, wind.funnelHalfWidth);
  // 旋衡（cyclostrophic）平衡项 v_t²/(r·k)：真实尘卷里让气团保持圆周运动的
  // 向心力来自涡内的径向气压梯度，气流本身是「往里压着转」的。
  // 少了这一项，气动力只把叶速拉向气流速度、不提供曲率，叶子持续外漂——
  // 实测漏掉时半径稳定在 ~500px，而该高度的壁面只有 ~273px（叶在卷外飞）。
  //
  // v_t 取叶片**实际**的切向速度而非气流的理想值 ω·r：向心力要平衡的是
  // 这片叶子真在做的圆周运动。用理想值算过一版——刚被卷起、还没转起来的
  // 叶子拿按满速算的向心力，被一路吸穿涡轴（实测有叶子落到 r=7px，
  // 方位角在轴心附近失去意义，螺旋断成两段）。
  const vt = (-dz * body.velocity.x + dx * body.velocity.z) / r;
  const cyclostrophic = (vt * vt) / (r * AERO_K);
  // 弹性向心：偏离壁面越远回吸越强，叶子因此贴壁盘旋而非乱飞。
  // 乘 gust 是物理必须而非调参：向心的径向气压梯度是**涡在转**才产生的，
  // 涡没转起来就没有低压核、也就没有向心力。少了这个系数，气旋成形幕
  // （此时 form 小、壁半径也小）会把贴地的叶子一路吸到涡轴上——
  // 实测有叶子在第一幕末落到 r=8px，方位角在轴心附近失去意义，
  // 「沿螺旋线上升」的角度读数就断了。
  const pull = (-(r - wall) * 3.4 - cyclostrophic) * wind.gust;
  // 向内的合速度再夹一道上限：单个时间常数内最多收掉半程，
  // 数值上保证叶子永不穿过涡轴（穿轴后方位角会翻符号）。
  const radial = Math.max(pull, -r * AERO_K * 0.5);
  out.set(
    (-dz / r) * tangential + (dx / r) * radial + wind.axisVx * falloff,
    wind.updraft * falloff,
    (dx / r) * tangential + (dz / r) * radial,
  );
}

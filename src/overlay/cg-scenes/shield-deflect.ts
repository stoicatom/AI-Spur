/**
 * 场景 25 shield 的签名机制：**格挡反弹**（动能沿弧面转向）。
 *
 * 与 axe / bomb 的分界不在强度而在**动能的去向**：那两个场景是击穿与
 * 爆裂——入射动能留在被击物里，把它撕开；本场景的动能**不进入盾**，
 * 而是沿盾面弧线**转向**后离开。所以这里没有"破坏量"，只有"出射方向"。
 *
 * 转向靠的是镜面反射律 `r = d - 2(d·n)n`，而 `n` 是**撞击点在弧面上的
 * 法线**——所以出射方向由撞击点位置共同决定，不是把入射方向取反。
 * 这条区别是本场景与全库其它冲击场景的唯一分界，且完全可测：
 *
 * - 取反（`r = -d`）会让出射方向与撞击点无关 → `deflectSpread` 恒为 0；
 * - 法线不随撞击点转（`n` 固定）同样让出射方向与撞击点无关；
 * - 真正的弧面反射下，出射角随撞击点**线性**转过 `2 × 弧法线角`
 *   （反射面转 α，反射线转 2α），斜率精确等于 `2 × ARC_HALF_ANGLE`。
 *
 * 另一条可测后果：切向分量**整份保留**、只有法向分量翻转。取反会把两个
 * 分量都翻掉——于是"擦边命中会滑走"这件事在取反模型里根本不存在。
 *
 * 本文件是**纯标量数学**，不碰 THREE、不改缓冲：闭式解让 update 可以被
 * 任意稀疏地调用而画出同一帧（R-PERF-001）。
 */

/** 二维向量：本模块刻意不依赖 THREE.Vector2，保持纯数学层可独立测试。 */
export type Vec2 = { readonly x: number; readonly y: number };

/** 整幕时长（毫秒），规格 §4.2 场景 25。 */
export const SHIELD_DURATION_MS = 1200;
/** 整幕时长（秒），物理换算用。 */
export const SHIELD_DURATION_S = SHIELD_DURATION_MS / 1000;
/** 第一幕结束点（200/1200）：来击抵达盾面。 */
export const SHIELD_ACT1_END = 200 / 1200;
/** 第二幕结束点（700/1200）：盾挡 + 波 + 火花。 */
export const SHIELD_ACT2_END = 700 / 1200;
/** 撞击时刻 = 第一幕末：来击与盾面接触的那一帧。 */
export const IMPACT_AT = SHIELD_ACT1_END;

/**
 * 盾弧的半张角（弧度）：从盾心到盾缘，法线转过的角度。
 *
 * 0.72 → 最大转向 `2 × 0.72` = 1.44 rad（82.5°），让边缘命中明显偏斜。
 *
 * **反向性只在盾面中段成立，不是整条盾缘**。规格互动②「弹开方向与来击
 * 方向相反」的判据是入射·出射 < 0；因为来击本身斜压（`STRIKE_ANGLE`
 * 相对盾心法线有偏角），转向量要与这个偏角叠加，所以偏斜最大的一侧会先
 * 越过 90°。数值扫描：当前来击角下 s ≲ -0.83 处点积转正。若要求整条盾缘
 * 都反向，H 需 ≲ 0.565——那样边缘偏斜就看不出来了，取舍上不值得。
 *
 * 本场景来击落在 `IMPACT_OFFSET`（0.42），该处入射·出射 ≈ -0.96，反向
 * 充分；`ARC_HALF_ANGLE` 与 `IMPACT_OFFSET` 任何一方被调整时，
 * 验收里的「弹开方向与来击相反」断言会在越界时报出来。
 */
export const ARC_HALF_ANGLE = 0.72;

/** 本场景来击的落点在弧面上的位置（-1 = 下缘，0 = 盾心，+1 = 上缘）。 */
export const IMPACT_OFFSET = 0.42;

/** 来击方向角（盾面坐标系，弧度）：略带俯冲的斜向直击，指向盾面内侧。 */
export const STRIKE_ANGLE = Math.PI + 0.22;

/** 盾面朝向（屏幕坐标系，弧度）：盾心法线指向左上，来击从左上压下来。 */
export const SHIELD_FACE_ANGLE = Math.PI * 0.86;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 撞击点位置钳到盾面范围内：超出盾缘就不是"被挡下"了。 */
function clampOffset(s: number): number {
  return Math.min(1, Math.max(-1, s));
}

/** 单位向量。 */
export function unitAt(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** 点积。 */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 向量角（弧度）。 */
export function angleOf(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

/**
 * 盾弧在某撞击点处的**外法线**（纯函数，签名的几何本体）。
 *
 * 圆弧的法线沿半径方向，因此法线角与弧长成正比：`α = s · ARC_HALF_ANGLE`。
 * 盾心（s=0）法线沿 +x（正对来击），往盾缘走法线逐渐倒向切向。
 * **法线必须随撞击点转**——它固定不动就等于把弧盾退化成平板。
 *
 * @param s 撞击点在弧面上的位置（-1 盾缘 … 0 盾心 … +1 盾缘）
 */
export function arcNormal(s: number): Vec2 {
  return unitAt(clampOffset(s) * ARC_HALF_ANGLE);
}

/** 盾弧在某撞击点处的切线（法线转 90°）：擦边分量沿它整份滑走。 */
export function arcTangent(s: number): Vec2 {
  const n = arcNormal(s);
  return { x: -n.y, y: n.x };
}

/**
 * 格挡反弹：入射动能沿弧面法线镜面反射（纯函数，**签名本体**）。
 *
 * `r = d - 2(d·n)n`。法向分量翻转、切向分量保留——这正是"挡住"与
 * "击穿"的分野：击穿把动能吃进去，格挡只改它的方向。
 *
 * 结果与 `-d`（简单取反）只在 s=0 且正撞时重合；任何偏心命中都会给出
 * 一个偏转过的方向，偏转量精确是 `2 · s · ARC_HALF_ANGLE`。
 *
 * @param incident 入射方向（盾面坐标系，指向盾面内侧）
 * @param s 撞击点在弧面上的位置
 */
export function deflect(incident: Vec2, s: number): Vec2 {
  const n = arcNormal(s);
  const dn = dot(incident, n);
  return {
    x: incident.x - 2 * dn * n.x,
    y: incident.y - 2 * dn * n.y,
  };
}

/**
 * 偏心命中把出射方向转离"直接倒回"的角度（弧度，纯函数）。
 *
 * 反射面转 α，反射线就转 2α——这是几何恒等式，与入射方向无关。
 * 因此这个量只由撞击点决定，是"动能沿弧面转向"的可测标度。
 *
 * @param s 撞击点在弧面上的位置
 */
export function deflectSpread(s: number): number {
  return 2 * clampOffset(s) * ARC_HALF_ANGLE;
}

/**
 * 盾面吃下的动能占比（0–1，纯函数）。
 *
 * 只有法向分量作用在盾上，功与法向速度平方成正比 → `(d̂·n)²`。
 * 因此**载荷在法线与入射共线处吃满**——不是在盾心。来击带
 * `STRIKE_ANGLE − π = 0.22` rad 的偏角，满载点落在
 * `s* = 0.22 / ARC_HALF_ANGLE ≈ 0.306`，盾心只有 0.952。
 * 越往两侧法线越偏离入射，占比越低，`s = ±1` 处降到 0.77 / 0.35——
 * 这就是"擦盾缘火花多、震动小"。
 *
 * 这条把签名接到元素⑦：地面震尘的强度是"没被弹开的那一份"。
 *
 * @param incident 入射方向（不必是单位向量，内部归一化）
 * @param s 撞击点在弧面上的位置
 */
export function normalLoad(incident: Vec2, s: number): number {
  const len = Math.hypot(incident.x, incident.y);
  if (len <= 1e-9) return 0;
  const cos = dot(incident, arcNormal(s)) / len;
  return clamp01(cos * cos);
}

/** 被弹开的动能占比：与 `normalLoad` 互补，两者恒和为 1。 */
export function deflectedFraction(incident: Vec2, s: number): number {
  return 1 - normalLoad(incident, s);
}

/**
 * 把盾面坐标系的向量转到屏幕坐标系。
 *
 * 盾面坐标系里 +x 是盾心法线；屏幕上这条法线指向 `faceAngle`。
 * 场景与验收共用这一个变换，避免两处各写一遍旋转而悄悄错开。
 */
export function toScreen(v: Vec2, faceAngle: number = SHIELD_FACE_ANGLE): Vec2 {
  const c = Math.cos(faceAngle);
  const s = Math.sin(faceAngle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** 本场景的来击方向（盾面坐标系单位向量）。 */
export function strikeIncident(): Vec2 {
  return unitAt(STRIKE_ANGLE);
}

/** 本场景的弹开方向（盾面坐标系单位向量）：签名函数直接给出。 */
export function strikeDeflected(): Vec2 {
  return deflect(strikeIncident(), IMPACT_OFFSET);
}

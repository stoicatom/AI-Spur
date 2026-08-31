/**
 * 场景 38 piano 的签名数学：**键盘连击与音符逐一配对**。
 *
 * 与六个已完成音乐场景（guitar 弦振传波、drum 击打凹陷、bell 驻波泛音、
 * trumpet 定向号口、harp 竖列拨弦、vinyl 旋转载体）划清的地方在
 * **激励与响应的基数**：那些都是「一次激励 → 一片响应」（拨一根弦、
 * 敲一次鼓、吹一口气，然后一整片波纹/泛音/雾扩散出去），本场景是
 * **n 次激励 → n 个响应，且一一对应**。
 *
 * 签名的可验收内涵是**配对可逆**：给定音符序号能唯一反解出它由第几次
 * 击键生出（`noteToKey`），给定击键序号能唯一算出它生出哪个音符
 * （`keyToNote`），两个方向互为逆运算。一段「音符随机飘出」的动画
 * 做不到这件事——那是伴奏，不是演奏。
 *
 * 第二条可验收内涵是**跃动而非飘升**（与 saxophone 的摇曳对立）：
 * 音符沿五线谱**逐跳**前进，每跳有明确的起跳时刻与落点，竖向轨迹是
 * 抛物线段的拼接（升—顶—落），不是一条光滑单调上升的曲线。
 *
 * 全部纯函数：update 会被以任意稀疏 t 调用，闭式求值才能保证同一 t
 * 永远画出同一帧（本项目 ice/meteor/wind 都踩过逐帧累加的坑）。
 */

/** 整幕时长（毫秒），规格 §4.2 场景 38。 */
export const PIANO_DURATION_MS = 1800;
/** 第一幕结束（起奏）。 */
export const PIANO_ACT1_END = 400 / 1800;
/** 第二幕结束（键闪+音符舞+五线谱）。 */
export const PIANO_ACT2_END = 1350 / 1800;

/** 连击次数：旋律的音符个数，也是键闪个数（一一对应的两端基数相同）。 */
export const KEY_STRIKE_COUNT = 7;
/** 五线谱线数（真实五线谱恒为 5）。 */
export const STAFF_LINE_COUNT = 5;

/**
 * 第 i 次击键的时刻（整幕归一化）。
 *
 * 连击铺在第二幕内：起奏幕在预备，尾声幕在收束，键只在演奏段落下。
 * 相邻间隔并非等分——旋律有疏密，`0.82` 的幂让后半段稍快，读起来
 * 像一句渐促的乐句而不是节拍器。
 *
 * @param i 击键序号（0 起）
 * @param count 连击总数，默认 KEY_STRIKE_COUNT
 */
export function keyStrikeAt(i: number, count = KEY_STRIKE_COUNT): number {
  if (i < 0 || i >= count) return Number.POSITIVE_INFINITY;
  const span = PIANO_ACT2_END - PIANO_ACT1_END;
  const a = count === 1 ? 0 : i / (count - 1);
  // 幂 < 1：前疏后密。取 a^0.82 而非线性，让乐句有推进感。
  return PIANO_ACT1_END + span * Math.pow(a, 0.82) * 0.92;
}

/**
 * 击键 i 生出的音符序号。
 *
 * **签名核心（正向）**：一一对应，所以这就是恒等映射。写成函数而不是
 * 直接用下标，是为了让「配对」这件事在调用点显式可见，也让
 * `noteToKey` 有一个可断言的逆。
 *
 * @param i 击键序号
 */
export function keyToNote(i: number): number {
  return i;
}

/**
 * 音符 n 由第几次击键生出。
 *
 * **签名核心（逆向）**：`keyToNote` 的逆。两个方向都存在且互逆，
 * 才叫「逐一配对」——若音符是随机生成的，这个函数不可能存在。
 *
 * @param n 音符序号
 */
export function noteToKey(n: number): number {
  return n;
}

/**
 * 音符 n 的起跳时刻。
 *
 * 由配对关系**反解**：音符不能在生它的那次击键之前出现。所以这里读
 * `keyStrikeAt(noteToKey(n))` 而不是另铺一条音符时间表——两张表会
 * 各自漂移，画面上就成了「音符与键各弹各的」。
 *
 * @param n 音符序号
 * @param count 连击总数
 */
export function noteBornAt(n: number, count = KEY_STRIKE_COUNT): number {
  return keyStrikeAt(noteToKey(n), count);
}

/** 键闪的衰减时长（整幕归一化）。 */
const FLASH_DECAY = 0.11;

/**
 * 键 i 的闪光亮度（0→1）。
 *
 * 互动②：键闪与音符节奏**一一对应**。亮度以该键自己的击打时刻为
 * 原点做指数衰减，所以七个键是**逐个**亮起，不是一起闪——这是
 * 「连击」的可测内涵。
 *
 * @param i 击键序号
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function keyFlash(i: number, t: number, count = KEY_STRIKE_COUNT): number {
  const at = keyStrikeAt(i, count);
  if (!Number.isFinite(at) || t < at) return 0;
  return Math.exp(-(t - at) / FLASH_DECAY);
}

/**
 * 旋律密度（0→1）：单位时间内的击键密集程度。
 *
 * ⑦ 节拍闪烁读这个量。它是**由击键时刻算出来的**（相邻间隔的倒数），
 * 不是另调一条节奏曲线——改 `keyStrikeAt` 的疏密，节拍闪烁会跟着变。
 *
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function melodyDensity(t: number, count = KEY_STRIKE_COUNT): number {
  let sum = 0;
  for (let i = 0; i < count; i += 1) sum += keyFlash(i, t, count);
  return Math.min(1, sum / 2.2);
}

/**
 * 共鸣板亮度（0→1）。
 *
 * ⑥ 琴腔震动光：读旋律密度并带一段余响（衰减比键闪慢得多）。
 * 琴腔是被所有键共同激励的，所以它是密度的积累而非某一键的响应。
 *
 * @param t 整幕归一化进度
 * @param count 连击总数
 */
export function soundboardGlow(t: number, count = KEY_STRIKE_COUNT): number {
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const at = keyStrikeAt(i, count);
    if (!Number.isFinite(at) || t < at) continue;
    // 余响：比键闪长约 4 倍，所以幕末仍有底光。
    sum += Math.exp(-(t - at) / (FLASH_DECAY * 4));
  }
  return Math.min(1, sum / 3.4);
}

/**
 * 踏板辉光（0→1）。
 *
 * ⑤ 踏板在起奏时踩下、整个演奏段保持、尾声松开。它是延音的来源，
 * 所以变化比键闪缓慢得多——一条包络而非脉冲。
 *
 * @param t 整幕归一化进度
 */
export function pedalGlow(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k < PIANO_ACT1_END) return (k / PIANO_ACT1_END) * 0.9;
  if (k < PIANO_ACT2_END) return 0.9;
  return 0.9 * (1 - (k - PIANO_ACT2_END) / (1 - PIANO_ACT2_END));
}

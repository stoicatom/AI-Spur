/**
 * 场景 26 axe 的签名机制：**劈裂木料 + 原木分段分离**（纯标量数学，不碰 THREE 对象）。
 *
 * 全库有两个「被利器分开」的场景，分野必须写在力学里而不是美术上：
 *
 * - katana（场景 06）是**切面滑过**：刀气弧沿斩击轴横扫，`arcSweep` 同时
 *   摆弧与决定拆哪排布约束，所以**切口位置恒等于刀锋位置**，材料在刀锋
 *   经过的那一刻断开，断面沿切向滑走。
 * - axe（本场景）是**楔入劈裂**：斧刃只沿**竖直**方向走，轴向位置整场
 *   不动；真正跑起来的是**裂纹前沿**——木材顺纹劈裂时，楔子挤开的木缝
 *   储存的弹性能会让裂纹**跑在斧刃前面**，斧刃才吃进两成，裂纹已经窜过
 *   小半根原木。分开后的两半沿裂面**法向张开**（垂直于裂纹推进方向），
 *   而不是沿切向滑走。
 *
 * 因此本模块的因果链是：`bladeY`（斧刃轨迹）→ `edgeDepth`（穿透深度）
 * → `crackReach`（裂纹前沿）→ 某段是否分离。分离时刻**不是时间表**，
 * 而是斧刃位置的函数：`segmentSplitAt(i)` 是对上面这条链的**闭式反解**，
 * 改斧刃轨迹的任一常数，六段的分离时刻会整体跟着移动。
 */

/** 整幕时长（毫秒）：规格 §4.2 场景 26。 */
export const AXE_DURATION_MS = 1200;

/** 第一幕结束点（250/1200）：抡起。 */
export const AXE_ACT1_END = 250 / AXE_DURATION_MS;
/** 第二幕结束点（750/1200）：劈落 + 分离 + 木屑。 */
export const AXE_ACT2_END = 750 / AXE_DURATION_MS;

/**
 * 起手时斧刃的高度（以原木厚度为单位，1 = 抡到最高点）。
 *
 * 不从 0 起：斧本来就举在半空，第一幕演的是「再抡高」而非「从地上捡起」。
 */
export const AXE_RAISE_START = 0.45;

/**
 * 自由挥落段时长（归一化幕）：从最高点到刃触木面。
 *
 * 168ms 走完一整个下劈行程——重斧靠自重加速，这一段是全场最快的运动，
 * 斧光弧的峰值就落在它的末端（见 `arcGlow`）。
 */
export const AXE_SWING_FALL_T = 0.14;

/**
 * 最深穿透（以原木厚度为单位）。
 *
 * 大于 1：刃穿透整根原木后还要啃进下面的砧木一点，这是「劈断」而不是
 * 「划开」——落地震荡的起点正是刃吃到砧木、行程走完的那一刻。
 */
export const AXE_BITE_DEPTH = 1.15;

/** 触木时刻（归一化）：`bladeY(t) = 0` 的解，不是独立写死的常数。 */
export const AXE_IMPACT_T = AXE_ACT1_END + AXE_SWING_FALL_T;

/**
 * 咬入段时长（归一化）= 自由段时长 × 最深穿透。
 *
 * 这个乘法不是凑数，而是**速度连续**的要求：自由段末速为
 * `2 / AXE_SWING_FALL_T`，咬入段初速为 `2·DEPTH / span`，两者相等即得
 * 本式。有了它，斧刃穿过木面时速度不跳变——一次连贯的挥砍，而不是
 * 「自由落体」与「插进木头」两段各自的动画。
 */
export const AXE_BITE_SPAN_T = AXE_SWING_FALL_T * AXE_BITE_DEPTH;

/** 行程走完（刃停在最深处）的时刻：落地震荡与回弹都从这里起算。 */
export const AXE_BITE_END_T = AXE_IMPACT_T + AXE_BITE_SPAN_T;

/** 斧刃下行的最大速率（归一化单位/幕），`arcGlow` 的归一化分母。 */
export const AXE_MAX_DESCENT_RATE = 2 / AXE_SWING_FALL_T;

/**
 * 原木分段数：**不随档位缩放**。
 *
 * 六段是签名载体而非密度堆料——「分段分离」要读得出是一条裂纹**依次**
 * 窜过整根木料，段数削到一两段就只剩「木头断了」，与任何一个碎裂场景
 * 无从区分。降档要减的是木屑那类量大而单调的颗粒（设计规格 §3.1
 * 「只减密度不移除元素」）。
 */
export const AXE_SEGMENT_COUNT = 6;

/**
 * 裂纹长度对穿透深度的次幂（< 1）：**裂纹跑在斧刃前面**。
 *
 * 顺纹劈裂时楔子做的功大半存进木缝两侧的弹性变形，裂纹尖端的应力强度
 * 因子随缝宽增长而增长，于是裂纹以远快于楔入的速度窜出去。指数取 0.62
 * 让「刃吃进两成、裂纹已过小半根」成立；用 >1 的指数会画出「刃推到哪、
 * 木头断到哪」——那退化成 katana 的切面滑过了。
 */
export const AXE_CRACK_P = 0.62;
/** 裂纹长度增益：depth=1（刃穿透整根）时裂纹恰好抵达远端。 */
export const AXE_CRACK_GAIN = 1;

/**
 * 斧刃高度（以原木厚度为单位，纯函数，整条因果链的源头）。
 *
 * `+1` = 抡到最高点，`0` = 刃尖贴住木面，`-AXE_BITE_DEPTH` = 行程走完。
 * 四段闭式：
 *
 * - 第一幕「抡起」：缓出到最高点，末速为零（举到头顶的那一顿）。
 * - 自由挥落：等加速（`1 - s²`），初速为零接上上一段。
 * - 咬入木料：等减速（`-D·(2s - s²)`），末速为零——刃停在最深处。
 * - 之后：停在最深处。**回弹是另一条曲线**（见 `axeRebound`），不写进
 *   这里：木料已经劈开了，斧退出来不能让它复原，因此驱动分离的深度必须
 *   单调不减。
 *
 * @param t 整幕归一化进度
 */
export function bladeY(t: number): number {
  if (t <= 0) return AXE_RAISE_START;
  if (t < AXE_ACT1_END) {
    const s = t / AXE_ACT1_END;
    return 1 - (1 - AXE_RAISE_START) * (1 - s) * (1 - s);
  }
  if (t < AXE_IMPACT_T) {
    const s = (t - AXE_ACT1_END) / AXE_SWING_FALL_T;
    return 1 - s * s;
  }
  if (t < AXE_BITE_END_T) {
    const s = (t - AXE_IMPACT_T) / AXE_BITE_SPAN_T;
    return -AXE_BITE_DEPTH * (2 * s - s * s);
  }
  return -AXE_BITE_DEPTH;
}
/**
 * 斧刃穿入木料的深度（0–AXE_BITE_DEPTH，纯函数）。
 *
 * `= max(0, -bladeY(t))`：木面之上一律为 0。**单调不减**——木料不会
 * 因为斧退出来而重新合上，分离的不可逆性锁在这个 max 上。
 *
 * @param t 整幕归一化进度
 */
export function edgeDepth(t: number): number {
  return Math.max(0, -bladeY(t));
}

/**
 * 裂纹前沿的轴向位置（0 = 落刃点，1 = 原木远端，纯函数）。
 *
 * 签名的本体：`depth^0.62`，亚线性所以**裂纹跑在斧刃前面**。这与
 * katana 的 `arcSweep`（切口 = 刀锋位置，线性同步）是两条不同的机制，
 * 而不是同一条曲线换个名字。
 *
 * @param t 整幕归一化进度
 */
export function crackReach(t: number): number {
  const depth = edgeDepth(t);
  if (depth <= 0) return 0;
  return Math.min(1, AXE_CRACK_GAIN * Math.pow(depth / 1, AXE_CRACK_P));
}

/**
 * 第 i 段的轴向站位（0–1，纯函数）。
 *
 * 取段中心：段 0 紧贴落刃点，段 N-1 在远端。裂纹要窜到这里，该段才谈得上
 * 分离，所以这个值同时是分离判据的阈值。
 *
 * @param i 段序号
 * @param count 总段数
 */
export function segmentSeat(i: number, count: number = AXE_SEGMENT_COUNT): number {
  return (i + 0.5) / count;
}

/**
 * 第 i 段分离所需的**斧刃穿透深度**（纯函数，反解的中间量）。
 *
 * 解 `crackReach = segmentSeat(i)`，即 `depth = (seat / gain)^(1/0.62)`。
 * 这一步把「裂纹到了哪」翻译回「斧刃吃进多少」——分离的因是斧刃位置，
 * 不是时刻。
 *
 * @param i 段序号
 * @param count 总段数
 */
export function segmentSplitDepth(i: number, count: number = AXE_SEGMENT_COUNT): number {
  return Math.pow(segmentSeat(i, count) / AXE_CRACK_GAIN, 1 / AXE_CRACK_P);
}

/**
 * 第 i 段的分离**时刻**（归一化幕，纯函数，对斧刃轨迹的闭式反解）。
 *
 * 由 `segmentSplitDepth` 沿 `bladeY` 的咬入段反解：
 * `-D(2s - s²) = -depth` ⇒ `s = 1 - sqrt(1 - depth/D)`。
 *
 * 这是签名「分离由斧刃驱动」的可测出口——它**不是**一张时间表：把
 * `AXE_SWING_FALL_T`、`AXE_BITE_DEPTH` 或 `AXE_CRACK_P` 改一改，六段的
 * 分离时刻会整体跟着移动。深度超出行程（裂纹永远到不了）时返回
 * `Infinity`，表示该段整幕不分离。
 *
 * @param i 段序号
 * @param count 总段数
 */
export function segmentSplitAt(i: number, count: number = AXE_SEGMENT_COUNT): number {
  const depth = segmentSplitDepth(i, count);
  if (depth > AXE_BITE_DEPTH) return Infinity;
  const s = 1 - Math.sqrt(1 - depth / AXE_BITE_DEPTH);
  return AXE_IMPACT_T + s * AXE_BITE_SPAN_T;
}


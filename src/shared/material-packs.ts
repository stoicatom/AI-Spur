import { z } from 'zod';

/**
 * 素材包（Material Pack）—— v3 三轴合一后的唯一选择轴。
 *
 * 一个素材包 = 图标（Figma 精绘 SVG）+ 运动轨迹特效（30 预设之一 + 参数化）
 *           + 程序化合成声音配方 + 配色（由图标主色推导）。
 *
 * 取代旧的三轴解耦体系（配色皮肤 skins / 音效包 sound presets / 素材 materials）。
 * Rust 端对应 `packs::MaterialPack`（serde rename_all = camelCase），两端字段必须一致。
 */

// ── 运动轨迹特效预设 ────────────────────────────────────────────────────────

/**
 * 30 个特效预设 id。每个预设是 overlay 里一套参数化的轨迹/爆裂程序
 * （见 src/overlay/effects.ts），内置素材通过 params 定制出独家动画。
 */
export const EFFECT_PRESET_IDS = [
  'jet',        // 喷射升空（尾焰+加速）
  'rise',       // 展翅上腾（双翼扩散）
  'bolt',       // 闪电劈裂（之字形分支）
  'wave',       // 龙腾蜿蜒（正弦波轨迹）
  'orbit',      // 飞旋环绕（圆周离心）
  'dash',       // 拔刀一斩（直线疾驰+残影）
  'shatter',    // 晶体碎裂（多面崩解）
  'burst',      // 幽魂爆散（放射状飞散）
  'flame-rise', // 火焰升腾（粒子上升+抖动）
  'shatter-ice',// 冰晶爆碎（尖棱飞溅）
  'shock-ring', // 雷震环波（环形冲击波）
  'water-splash',// 水花四溅（抛物线水滴）
  'whirl',      // 旋风回旋（螺旋上升）
  'star-burst', // 星形爆发（五角星状粒子）
  'impact',     // 重击冲击（中心放射+碎屑）
  'comet',      // 坠击爆燃（拖尾+爆裂）
  'trail-burst',// 拖尾爆裂（长尾+端点爆）
  'pulse',      // 弦振脉冲（同心圆扩散）
  'ring',       // 声波回荡（多环扩散）
  'petal',      // 花瓣飘散（旋转下落）
  'echo',       // 余韵回荡（渐弱回环）
  'arc',        // 弧光斩击（弧形轨迹）
  'spiral',     // 螺旋上升（粒子螺旋）
  'split',      // 分身四散（复制扩散）
  'chain',      // 锁链波动（连串涟漪）
  'glow',       // 辉光膨胀（光晕扩散）
  'twinkle',    // 星光闪烁（多点闪亮）
  'vortex',     // 漩涡聚拢（向心旋转）
  'rain',       // 雨丝斜落（斜线粒子）
  'explode',    // 猛烈爆炸（大面积火光）
] as const;

export const EffectPresetSchema = z.enum(EFFECT_PRESET_IDS);
export type EffectPresetId = z.infer<typeof EffectPresetSchema>;

// ── 程序化合成声音配方 ──────────────────────────────────────────────────────

export const SoundLayerTypeSchema = z.enum([
  'noise',   // 噪声爆发（风/爆/沙）
  'tone',    // 单一振荡音（铃/金属）
  'sweep',   // 频率扫掠（呼啸/下坠）
  'impact',  // 冲击（短促重击）
  'chime',   // 泛音钟声（多谐波）
  'rumble',  // 低频轰鸣（雷/鼓）
]);

export const OscillatorTypeSchema = z.enum([
  'sine', 'square', 'sawtooth', 'triangle',
]);

export const FilterTypeSchema = z.enum([
  'lowpass', 'highpass', 'bandpass', 'notch',
]);

export const NoiseColorSchema = z.enum(['white', 'pink']);

export const SoundLayerSchema = z.object({
  type: SoundLayerTypeSchema,
  /** 起音时间（秒） */
  attack: z.number().min(0).max(0.5),
  /** 衰减时间（秒） */
  decay: z.number().min(0.01).max(5),
  /** 层增益 0-1 */
  gain: z.number().min(0).max(1),
  filter: z
    .object({
      type: FilterTypeSchema,
      freq: z.number().min(20).max(20000),
      freqEnd: z.number().min(20).max(20000).optional(),
      q: z.number().min(0.1).max(30).default(1),
    })
    .optional(),
  osc: z
    .object({
      type: OscillatorTypeSchema,
      freq: z.number().min(20).max(20000),
      freqEnd: z.number().min(20).max(20000).optional(),
    })
    .optional(),
  noiseColor: NoiseColorSchema.optional(),
  /** 延迟回响（秒），0 = 无 */
  delay: z.number().min(0).max(1).default(0),
});

export type SoundLayer = z.infer<typeof SoundLayerSchema>;

export const SoundRecipeSchema = z.object({
  /** 多层音色：主击 + 共鸣 + 余韵 */
  layers: z.array(SoundLayerSchema).min(1).max(6),
  /** 主增益 0-1 */
  masterGain: z.number().min(0.05).max(1).default(0.8),
});

export type SoundRecipe = z.infer<typeof SoundRecipeSchema>;

// ── 素材包 ─────────────────────────────────────────────────────────────────

export const MaterialPackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  builtin: z.boolean(),
  /** 图标文件名（素材包目录下）。 */
  imageFile: z.string().min(1),
  /** 图标内容 data: URI（Rust 扫描时内联）。 */
  dataUri: z.string().min(1),
  /** 运动轨迹特效：预设 id + 参数化覆盖。 */
  effect: z.object({
    preset: EffectPresetSchema,
    /** 预设的数值参数覆盖（与预设默认参数合并）。 */
    params: z.record(z.string(), z.number()).default({}),
  }),
  /** 程序化合成声音配方。 */
  sound: SoundRecipeSchema,
  /** 配色：鞭身渐变 + 粒子色相。由图标主色推导，可覆盖。 */
  palette: z.object({
    bodyGradient: z.tuple([
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
    ]),
    particleHue: z.number().int().min(0).max(359),
  }),
});

export type MaterialPack = z.infer<typeof MaterialPackSchema>;

/** 30 个内置素材包 id，与 `src-tauri/packs/<id>/` 目录一一对应。 */
export const BUILTIN_PACK_IDS = [
  'rocket', 'phoenix', 'lightning', 'dragon', 'ninja-star', 'katana',
  'crystal', 'skull', 'flame', 'ice', 'thunder', 'water', 'wind',
  'star', 'moon', 'sun', 'meteor', 'comet', 'guitar', 'drum',
  'bell', 'harp', 'trumpet', 'bow', 'shield', 'axe', 'spear',
  'bomb', 'lotus', 'aurora',
] as const;

export type BuiltinPackId = (typeof BUILTIN_PACK_IDS)[number];

/** 默认活跃素材包 id。与 Rust config 默认值及 config.ts 保持一致。 */
export const DEFAULT_PACK_ID: BuiltinPackId = 'rocket';

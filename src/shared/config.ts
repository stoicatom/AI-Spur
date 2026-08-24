import { z } from 'zod';

export const AnimationModeSchema = z.enum(['standard', 'fast', 'auto']);
export type AnimationMode = z.infer<typeof AnimationModeSchema>;

export const ThemeSchema = z.enum(['light', 'dark', 'auto']);
export type Theme = z.infer<typeof ThemeSchema>;

export const ConfigSchema = z.object({
  version: z.literal('3.0'),
  hotkey: z.string().min(1),
  phrases: z.array(z.string().min(1)).min(1).max(20),
  animationMode: AnimationModeSchema,
  autoSwitchThreshold: z.number().int().min(1).max(100),
  usageCount: z.number().int().min(0),
  todayUsageCount: z.number().int().min(0),
  // ISO 8601. Rust serialises `Option<String>::None` as JSON `null`, so the
  // schema must accept null as well as undefined; both normalise to undefined
  // so the TS-facing type stays `string | undefined`.
  lastUsageDate: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  playSound: z.boolean(),
  showBorderFlash: z.boolean(),
  crackSensitivity: z.number().min(0.5).max(2.0),
  theme: ThemeSchema,
  language: z.enum(['auto', 'zh-CN', 'en-US']).default('auto'),
  firstLaunch: z.boolean(),
  /**
   * 活跃素材包 id（v3 唯一选择轴：图标+特效+声音+配色）。
   * 取代 v2 的 activeSkin / crackSoundId / activeMaterialId 三轴。
   * 新增字段用 default 保持向后兼容。
   */
  activePackId: z.string().default('rocket'),
  /**
   * v2 遗留字段：仅用于迁移时保留，运行时不再使用。
   * Rust 迁移后不再写回；此处保留 default 以兼容 v2 配置解析。
   */
  activeSkin: z.string().optional(),
  crackSoundId: z.string().optional(),
  activeMaterialId: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  version: '3.0',
  hotkey: 'CommandOrControl+Shift+W',
  phrases: ['FASTER', 'KEEP GOING', "DON'T STOP NOW", 'SHOW ME WHAT YOU GOT'],
  animationMode: 'auto',
  autoSwitchThreshold: 20,
  usageCount: 0,
  todayUsageCount: 0,
  lastUsageDate: undefined,
  playSound: true,
  showBorderFlash: true,
  crackSensitivity: 1.0,
  theme: 'auto',
  language: 'auto',
  firstLaunch: true,
  activePackId: 'rocket',
};

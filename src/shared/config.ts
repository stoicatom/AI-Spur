import { z } from 'zod';

export const AnimationModeSchema = z.enum(['standard', 'fast', 'auto']);
export type AnimationMode = z.infer<typeof AnimationModeSchema>;

export const ConfigSchema = z.object({
  version: z.literal('2.0'),
  hotkey: z.string().min(1),
  phrases: z.array(z.string().min(1)).min(1).max(20),
  activeSkin: z.string(),
  animationMode: AnimationModeSchema,
  autoSwitchThreshold: z.number().int().min(1).max(100),
  usageCount: z.number().int().min(0),
  todayUsageCount: z.number().int().min(0),
  lastUsageDate: z.string().optional(), // ISO 8601
  playSound: z.boolean(),
  showBorderFlash: z.boolean(),
  crackSensitivity: z.number().min(0.5).max(2.0),
  firstLaunch: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  version: '2.0',
  hotkey: 'CommandOrControl+Shift+W',
  phrases: ['FASTER', 'KEEP GOING', "DON'T STOP NOW", 'SHOW ME WHAT YOU GOT'],
  activeSkin: 'default',
  animationMode: 'auto',
  autoSwitchThreshold: 20,
  usageCount: 0,
  todayUsageCount: 0,
  lastUsageDate: undefined,
  playSound: true,
  showBorderFlash: true,
  crackSensitivity: 1.0,
  firstLaunch: true,
};

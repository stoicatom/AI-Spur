import { describe, it, expect } from 'vitest';
import { ConfigSchema, DEFAULT_CONFIG } from '../shared/config';

describe('Config schema', () => {
  it('should parse default config', () => {
    const result = ConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });

  it('should reject empty phrases array', () => {
    const invalid = { ...DEFAULT_CONFIG, phrases: [] };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject negative usageCount', () => {
    const invalid = { ...DEFAULT_CONFIG, usageCount: -1 };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject autoSwitchThreshold > 100', () => {
    const invalid = { ...DEFAULT_CONFIG, autoSwitchThreshold: 101 };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept valid animationMode values', () => {
    ['standard', 'fast', 'auto'].forEach((mode) => {
      const cfg = { ...DEFAULT_CONFIG, animationMode: mode };
      expect(ConfigSchema.safeParse(cfg).success).toBe(true);
    });
  });

  it('should reject invalid animationMode', () => {
    const invalid = { ...DEFAULT_CONFIG, animationMode: 'turbo' };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('v4 quality', () => {
  const base = {
    version: '4.0',
    hotkey: 'CommandOrControl+Shift+W',
    phrases: ['FASTER'],
    animationMode: 'auto',
    autoSwitchThreshold: 20,
    usageCount: 0,
    todayUsageCount: 0,
    playSound: true,
    showBorderFlash: true,
    crackSensitivity: 1,
    theme: 'auto',
    language: 'auto',
    firstLaunch: true,
    windowPresence: 'tray',
    activePackId: 'rocket',
  } as const;

  it('解析 quality=cinematic', () => {
    const cfg = ConfigSchema.parse({ ...base, quality: 'cinematic' });
    expect(cfg.quality).toBe('cinematic');
  });

  it('quality 缺省为 auto', () => {
    const cfg = ConfigSchema.parse(base);
    expect(cfg.quality).toBe('auto');
  });

  it('拒绝非法 quality', () => {
    expect(() => ConfigSchema.parse({ ...base, quality: 'ultra' })).toThrow();
  });

  it('拒绝 v3 版本', () => {
    expect(() => ConfigSchema.parse({ ...base, version: '3.0' })).toThrow();
  });
});

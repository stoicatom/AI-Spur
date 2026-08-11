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

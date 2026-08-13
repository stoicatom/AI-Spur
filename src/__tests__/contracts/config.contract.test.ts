import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../../shared/config';

describe('Config IPC contract', () => {
  describe('get_config response', () => {
    it('解析含 lastUsageDate: null 的配置', () => {
      const rustResponse = {
        version: '2.0',
        hotkey: 'CommandOrControl+Shift+W',
        phrases: ['FASTER'],
        activeSkin: 'default',
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: 42,
        todayUsageCount: 7,
        lastUsageDate: null, // Rust `Option<String>::None` 序列化为 null
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        theme: 'auto',
        firstLaunch: false,
      };

      const parsed = ConfigSchema.parse(rustResponse);
      expect(parsed.usageCount).toBe(42);
      expect(parsed.lastUsageDate).toBeUndefined(); // transform 将 null 转为 undefined
    });

    it('解析含 lastUsageDate: "2026-08-13" 的配置', () => {
      const rustResponse = {
        version: '2.0',
        hotkey: 'CommandOrControl+Shift+W',
        phrases: ['FASTER'],
        activeSkin: 'default',
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: 100,
        todayUsageCount: 5,
        lastUsageDate: '2026-08-13',
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        theme: 'dark',
        firstLaunch: false,
      };

      const parsed = ConfigSchema.parse(rustResponse);
      expect(parsed.lastUsageDate).toBe('2026-08-13');
    });

    it('拒绝缺失 version 的配置', () => {
      const invalid = {
        hotkey: 'CmdOrCtrl+W',
        phrases: ['A'],
        // version 缺失
      };

      expect(() => ConfigSchema.parse(invalid)).toThrow();
    });

    it('拒绝空 phrases 数组', () => {
      const invalid = {
        version: '2.0',
        hotkey: 'CmdOrCtrl+W',
        phrases: [], // 违反 .min(1)
        activeSkin: 'default',
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: 0,
        todayUsageCount: 0,
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        firstLaunch: false,
      };

      expect(() => ConfigSchema.parse(invalid)).toThrow();
    });

    it('拒绝负数 usageCount', () => {
      const invalid = {
        version: '2.0',
        hotkey: 'CmdOrCtrl+W',
        phrases: ['A'],
        activeSkin: 'default',
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: -1, // 违反 .min(0)
        todayUsageCount: 0,
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        firstLaunch: false,
      };

      expect(() => ConfigSchema.parse(invalid)).toThrow();
    });
  });
});

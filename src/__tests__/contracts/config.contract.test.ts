import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../../shared/config';

describe('Config IPC contract', () => {
  describe('get_config response (v3)', () => {
    it('解析含 lastUsageDate: null 的配置', () => {
      const rustResponse = {
        version: '3.0',
        hotkey: 'CommandOrControl+Shift+W',
        phrases: ['FASTER'],
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
        activePackId: 'rocket',
      };

      const parsed = ConfigSchema.parse(rustResponse);
      expect(parsed.usageCount).toBe(42);
      expect(parsed.lastUsageDate).toBeUndefined(); // transform 将 null 转为 undefined
      expect(parsed.activePackId).toBe('rocket');
    });

    it('解析含 lastUsageDate: "2026-08-13" 的配置', () => {
      const rustResponse = {
        version: '3.0',
        hotkey: 'CommandOrControl+Shift+W',
        phrases: ['FASTER'],
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
        activePackId: 'phoenix',
      };

      const parsed = ConfigSchema.parse(rustResponse);
      expect(parsed.lastUsageDate).toBe('2026-08-13');
      expect(parsed.activePackId).toBe('phoenix');
    });

    it('缺失 activePackId 时回退默认 rocket', () => {
      // Rust 侧 serde default 保证不缺失；此处验证 Zod 侧的兜底。
      const rustResponse = {
        version: '3.0',
        hotkey: 'CommandOrControl+Shift+W',
        phrases: ['FASTER'],
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: 0,
        todayUsageCount: 0,
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        theme: 'auto',
        firstLaunch: false,
      };
      const parsed = ConfigSchema.parse(rustResponse);
      expect(parsed.activePackId).toBe('rocket');
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
        version: '3.0',
        hotkey: 'CmdOrCtrl+W',
        phrases: [], // 违反 .min(1)
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: 0,
        todayUsageCount: 0,
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        firstLaunch: false,
        activePackId: 'rocket',
      };

      expect(() => ConfigSchema.parse(invalid)).toThrow();
    });

    it('拒绝负数 usageCount', () => {
      const invalid = {
        version: '3.0',
        hotkey: 'CmdOrCtrl+W',
        phrases: ['A'],
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: -1, // 违反 .min(0)
        todayUsageCount: 0,
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        firstLaunch: false,
        activePackId: 'rocket',
      };

      expect(() => ConfigSchema.parse(invalid)).toThrow();
    });
  });

  describe('v2 → v3 迁移（Rust 端语义镜像）', () => {
    // 这些用例验证 TS 侧对「Rust 迁移后返回」的兼容：即使前端拿到 v3 配置，
    // 旧的三轴字段不再出现在 payload 中。
    it('v3 payload 不含旧三轴字段', () => {
      const parsed = ConfigSchema.parse({
        version: '3.0',
        hotkey: 'CommandOrControl+Shift+W',
        phrases: ['FASTER'],
        animationMode: 'auto',
        autoSwitchThreshold: 20,
        usageCount: 0,
        todayUsageCount: 0,
        playSound: true,
        showBorderFlash: true,
        crackSensitivity: 1.0,
        theme: 'auto',
        firstLaunch: false,
        activePackId: 'meteor',
      });
      expect(parsed.activeSkin).toBeUndefined();
      expect(parsed.crackSoundId).toBeUndefined();
      expect(parsed.activeMaterialId).toBeUndefined();
    });
  });
});

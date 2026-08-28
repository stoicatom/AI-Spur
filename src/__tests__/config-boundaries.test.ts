import { describe, it, expect } from 'vitest';
import { ConfigSchema, DEFAULT_CONFIG } from '../shared/config';

/**
 * 极端边界测试：验证 ConfigSchema 对每个字段的边界值、非法值、
 * 类型错误、null/undefined 的拒绝与接受行为。
 *
 * TDD 动机：配置是跨进程（Rust serde ↔ TS Zod）的契约，任何一端放宽
 * 都会导致另一端的静默错误。此文件确保 TS 端 schema 与 Rust serde 的
 * 约束完全对齐。
 */

const VALID = { ...DEFAULT_CONFIG };

/** 构造一个只改一个字段的配置变体。 */
function variant(patch: Partial<typeof VALID>): unknown {
  return { ...VALID, ...patch };
}

describe('ConfigSchema 边界：version / hotkey', () => {
  it('拒绝非 3.0 的 version', () => {
    expect(ConfigSchema.safeParse(variant({ version: '2.0' as never })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ version: '4.0' as never })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ version: '' as never })).success).toBe(false);
  });

  it('version 缺失时拒绝（不能在运行时悄悄退回默认）', () => {
    const { version: _dropped, ...rest } = VALID;
    expect(ConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('hotkey 空字符串拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ hotkey: '' })).success).toBe(false);
  });

  it('hotkey 超长（10KB）宽松接受 — 记录当前行为，Rust 端应负责长度门禁', () => {
    // 发现：schema 无 hotkey 长度上限（仅 min(1)）。IPC 栈之上没有
    // 其它校验层，若 Rust 端 save_config 也未限制，恶意超长字符串会
    // 直达全局快捷键注册。此处按当前行为断言，标记为待加固点。
    const huge = 'A'.repeat(10_000);
    expect(ConfigSchema.safeParse(variant({ hotkey: huge })).success).toBe(true);
  });
});

describe('ConfigSchema 边界：phrases', () => {
  it('空数组拒绝（至少 1 条）', () => {
    expect(ConfigSchema.safeParse(variant({ phrases: [] })).success).toBe(false);
  });

  it('恰好 1 条接受（下限）', () => {
    expect(ConfigSchema.safeParse(variant({ phrases: ['ONLY'] })).success).toBe(true);
  });

  it('恰好 20 条接受（上限）', () => {
    expect(ConfigSchema.safeParse(variant({ phrases: Array.from({ length: 20 }, (_, i) => `P${i}`) })).success).toBe(true);
  });

  it('21 条拒绝（超出上限）', () => {
    expect(ConfigSchema.safeParse(variant({ phrases: Array.from({ length: 21 }, (_, i) => `P${i}`) })).success).toBe(false);
  });

  it('含空字符串的数组拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ phrases: ['VALID', ''] })).success).toBe(false);
  });

  it('纯空白短语宽接受（记录当前行为 — 发送时 pick_phrase 随机抽取可能命中）', () => {
    // 发现：schema 仅校验 min(1)，空白字符串通过。发送宏时可能把
    // 无效提示词发给终端。标记为待加固点。
    expect(ConfigSchema.safeParse(variant({ phrases: ['   '] })).success).toBe(true);
  });
});

describe('ConfigSchema 边界：数值字段', () => {
  it('autoSwitchThreshold = 1 接受 / 0 拒绝 / 100 接受 / 101 拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ autoSwitchThreshold: 1 })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ autoSwitchThreshold: 0 })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ autoSwitchThreshold: 100 })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ autoSwitchThreshold: 101 })).success).toBe(false);
  });

  it('autoSwitchThreshold 非整数拒绝（float）', () => {
    expect(ConfigSchema.safeParse(variant({ autoSwitchThreshold: 10.5 })).success).toBe(false);
  });

  it('usageCount / todayUsageCount = 0 接受 / 负数拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ usageCount: 0, todayUsageCount: 0 })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ usageCount: -1 })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ todayUsageCount: -1 })).success).toBe(false);
  });

  it('usageCount 浮点拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ usageCount: 1.5 })).success).toBe(false);
  });

  it('crackSensitivity = 0.5 接受 / 0.49 拒绝 / 2.0 接受 / 2.01 拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ crackSensitivity: 0.5 })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ crackSensitivity: 0.49 })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ crackSensitivity: 2.0 })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ crackSensitivity: 2.01 })).success).toBe(false);
  });

  it('NaN / Infinity 拒绝（JSON 无法序列化，防止 Rust 端读到非法值）', () => {
    expect(ConfigSchema.safeParse(variant({ crackSensitivity: Number.NaN })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ autoSwitchThreshold: Number.POSITIVE_INFINITY })).success).toBe(false);
  });
});

describe('ConfigSchema 边界：枚举字段', () => {
  it('animationMode 只接受 standard / fast / auto', () => {
    for (const bad of ['turbo', 'Standard', 'AUTO', '', 1, null, undefined]) {
      const r = ConfigSchema.safeParse(variant({ animationMode: bad as never }));
      expect(r.success).toBe(false);
    }
  });

  it('theme 只接受 light / dark / auto', () => {
    for (const bad of ['black', 'Light', 'AUTO', '', 0, null]) {
      expect(ConfigSchema.safeParse(variant({ theme: bad as never })).success).toBe(false);
    }
  });

  it('language 只接受 auto / zh-CN / en-US', () => {
    for (const bad of ['fr-FR', 'zh', 'AUTO', 1]) {
      expect(ConfigSchema.safeParse(variant({ language: bad as never })).success).toBe(false);
    }
    expect(ConfigSchema.safeParse(variant({ language: 'zh-CN' })).success).toBe(true);
  });

  it('windowPresence supports tray and persistent and defaults legacy configs to tray', () => {
    expect(ConfigSchema.safeParse(variant({ windowPresence: 'tray' })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ windowPresence: 'persistent' })).success).toBe(true);
    expect(ConfigSchema.safeParse(variant({ windowPresence: 'dock' as never })).success).toBe(false);
    const { windowPresence: _dropped, ...legacy } = VALID;
    const parsed = ConfigSchema.parse(legacy);
    expect(parsed.windowPresence).toBe('tray');
  });
});

describe('ConfigSchema 边界：null / undefined 处理', () => {
  it('lastUsageDate null 转 undefined（Rust Option::None 契约）', () => {
    const parsed = ConfigSchema.parse(variant({ lastUsageDate: null as never }));
    expect(parsed.lastUsageDate).toBeUndefined();
  });

  it('lastUsageDate 缺失时接受（undefined）', () => {
    const { lastUsageDate: _dropped, ...rest } = VALID;
    const parsed = ConfigSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.lastUsageDate).toBeUndefined();
  });

  it('lastUsageDate 空字符串接受但保持空串（ISO 契约之外不过度约束）', () => {
    // 当前 schema 不校验 ISO 格式；与 Rust 端行为保持一致
    expect(ConfigSchema.safeParse(variant({ lastUsageDate: '' })).success).toBe(true);
  });

  it('playSound / showBorderFlash / firstLaunch 缺失拒绝（布尔必须显式）', () => {
    const { playSound: _a, ...r1 } = VALID;
    const { showBorderFlash: _b, ...r2 } = VALID;
    const { firstLaunch: _c, ...r3 } = VALID;
    expect(ConfigSchema.safeParse(r1).success).toBe(false);
    expect(ConfigSchema.safeParse(r2).success).toBe(false);
    expect(ConfigSchema.safeParse(r3).success).toBe(false);
  });

  it('playSound 非布尔拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ playSound: 'yes' as never })).success).toBe(false);
  });
});

describe('ConfigSchema 边界：v2 遗留字段与未知字段', () => {
  it('activeSkin 等 v2 遗留字段缺省时解析成功', () => {
    expect(ConfigSchema.safeParse(VALID).success).toBe(true);
  });

  it('activeSkin 等 v2 遗留字段携带时解析成功（兼容迁移）', () => {
    expect(ConfigSchema.safeParse(variant({ activeSkin: 'fire', crackSoundId: 'crack', activeMaterialId: 'axe' })).success).toBe(true);
  });

  it('未知字段被 strip（不报错）', () => {
    const result = ConfigSchema.safeParse({ ...VALID, unknownField: 'x' } as unknown);
    expect(result.success).toBe(true);
    if (result.success) expect('unknownField' in result.data).toBe(false);
  });
});

describe('ConfigSchema 边界：深层类型错误', () => {
  it('phrases 中混入非字符串拒绝', () => {
    expect(ConfigSchema.safeParse(variant({ phrases: ['OK', 42 as never] })).success).toBe(false);
    expect(ConfigSchema.safeParse(variant({ phrases: [null as never] })).success).toBe(false);
  });

  it('配置为 null / 数组 / 字符串时拒绝（IPC 层防崩溃）', () => {
    expect(ConfigSchema.safeParse(null).success).toBe(false);
    expect(ConfigSchema.safeParse([]).success).toBe(false);
    expect(ConfigSchema.safeParse('config').success).toBe(false);
    expect(ConfigSchema.safeParse(undefined).success).toBe(false);
  });

  it('配置经 JSON 往返（Rust serde_json 序列化）后仍可解析', () => {
    // 模拟 Rust → JSON 字符串 → TS 的完整 IPC 路径
    const roundtripped = JSON.parse(JSON.stringify(VALID));
    expect(ConfigSchema.safeParse(roundtripped).success).toBe(true);
  });

  it('JSON 往返后的 null lastUsageDate 解析为 undefined', () => {
    const json = JSON.stringify({ ...VALID, lastUsageDate: null });
    const parsed = ConfigSchema.parse(JSON.parse(json));
    expect(parsed.lastUsageDate).toBeUndefined();
  });
});

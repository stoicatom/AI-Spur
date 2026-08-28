import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialPackSchema } from '../../shared/material-packs';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { updateCustomPack } from '../../shared/ipc';

/**
 * update_custom_pack 响应契约。
 *
 * 关键坑：Rust 的 `Option::None` 序列化成 `null`（不是省略），
 * 因此 sample / filter / osc / noiseColor 都可能是 null —— schema 必须
 * 用 nullish() 吃下（参照 material-pack.real.test.ts）。
 */

/** Rust `pack_edit::update_custom_pack` 重新 scan 后的真实响应形状。 */
const rustResponse = {
  id: 'my-forge-l3k9',
  name: '我的锻炉',
  builtin: false,
  imageFile: 'icon.svg',
  dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
  effect: { preset: 'impact', params: { chop: 1.9, weight: 2.1, cleave: 1.5 } },
  sound: {
    layers: [],
    sample: {
      file: 'sound.m4a',
      dataUri: 'data:audio/mp4;base64,AAAA',
      gain: 0.82,
      maxDuration: 8,
      sourceTitle: 'recording.m4a',
      sourceUrl: 'https://local.user-upload.invalid/recording',
      license: '用户自有素材',
    },
    masterGain: 0.8,
  },
  palette: { bodyGradient: ['#ff6b35', '#c23e00'], particleHue: 24 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('update_custom_pack 响应契约', () => {
  it('解析编辑后的自定义素材包', async () => {
    vi.mocked(invoke).mockResolvedValue(rustResponse);

    const pack = await updateCustomPack({ id: 'my-forge-l3k9', name: '我的锻炉' });

    expect(pack.id).toBe('my-forge-l3k9');
    expect(pack.builtin).toBe(false);
    expect(pack.effect.params).toEqual({ chop: 1.9, weight: 2.1, cleave: 1.5 });
    expect(pack.sound.sample?.file).toBe('sound.m4a');
  });

  it('吃下 Rust Option::None 序列化出的 null（sample / 嵌套字段）', () => {
    const legacyShape = {
      ...rustResponse,
      sound: {
        layers: [
          {
            type: 'impact',
            attack: 0.01,
            decay: 0.3,
            gain: 0.8,
            filter: null,
            osc: null,
            noiseColor: null,
            delay: 0,
          },
        ],
        sample: null,
        masterGain: 0.8,
      },
    };

    const parsed = MaterialPackSchema.parse(legacyShape);
    expect(parsed.sound.sample).toBeUndefined();
    expect(parsed.sound.layers[0].filter).toBeUndefined();
    expect(parsed.sound.layers[0].osc).toBeUndefined();
  });

  it('空 params 也是合法响应（旧包未设参数）', () => {
    const parsed = MaterialPackSchema.parse({
      ...rustResponse,
      effect: { preset: 'impact', params: {} },
    });
    expect(parsed.effect.params).toEqual({});
  });

  it('拒绝 Rust 不该产出的形状（未知预设）', () => {
    expect(() =>
      MaterialPackSchema.parse({ ...rustResponse, effect: { preset: 'nope', params: {} } }),
    ).toThrow();
  });

  it('只传 id 时不发送其余字段 —— 后端据此沿用现有值', async () => {
    vi.mocked(invoke).mockResolvedValue(rustResponse);

    await updateCustomPack({ id: 'my-forge-l3k9' });

    expect(invoke).toHaveBeenCalledWith('update_custom_pack', { id: 'my-forge-l3k9' });
  });

  it('透传全部可编辑字段', async () => {
    vi.mocked(invoke).mockResolvedValue(rustResponse);

    await updateCustomPack({
      id: 'my-forge-l3k9',
      name: '改名',
      iconPath: '/tmp/new-icon.svg',
      soundPath: '/tmp/new-sound.wav',
      effectPreset: 'impact',
      effectParams: { chop: 2.4 },
      palette: { bodyGradient: ['#ff6b35', '#c23e00'], particleHue: 24 },
    });

    expect(invoke).toHaveBeenCalledWith('update_custom_pack', {
      id: 'my-forge-l3k9',
      name: '改名',
      iconPath: '/tmp/new-icon.svg',
      soundPath: '/tmp/new-sound.wav',
      effectPreset: 'impact',
      effectParams: { chop: 2.4 },
      palette: { bodyGradient: ['#ff6b35', '#c23e00'], particleHue: 24 },
    });
  });
});

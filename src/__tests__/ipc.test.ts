import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getConfig,
  saveConfig,
  incrementUsage,
  registerHotkey,
  listSkins,
  activateSkin,
  onSpawnWhip,
  onConfigUpdated,
  onSkinChanged,
} from '../shared/ipc';
import { DEFAULT_CONFIG } from '../shared/config';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** A manifest that satisfies SkinManifestSchema, used as a list_skins fixture. */
const validSkin = {
  specVersion: '1' as const,
  id: 'default',
  name: 'Classic',
  visuals: {
    handleColor: '#111111',
    bodyGradient: ['#111111', '#333333'] as [string, string],
    tipGlow: false,
    particleEffect: 'none' as const,
    outlineColor: '#ffffff',
    bgAlpha: 0.011,
  },
  sounds: { crack: ['A.mp3'], whoosh: [] },
};

describe('IPC layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getConfig should invoke get_config and parse response', async () => {
    vi.mocked(invoke).mockResolvedValue(DEFAULT_CONFIG);
    const config = await getConfig();
    expect(invoke).toHaveBeenCalledWith('get_config');
    expect(config.version).toBe('2.0');
  });

  it('getConfig should throw if response is invalid', async () => {
    vi.mocked(invoke).mockResolvedValue({ version: '1.0' }); // 错误版本
    await expect(getConfig()).rejects.toThrow();
  });

  it('saveConfig should invoke save_config with payload', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await saveConfig(DEFAULT_CONFIG);
    expect(invoke).toHaveBeenCalledWith('save_config', { config: DEFAULT_CONFIG });
  });

  it('incrementUsage should invoke increment_usage and return new count', async () => {
    vi.mocked(invoke).mockResolvedValue(42);
    const count = await incrementUsage();
    expect(invoke).toHaveBeenCalledWith('increment_usage');
    expect(count).toBe(42);
  });

  it('onSpawnWhip should call listen and invoke callback', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
    const callback = vi.fn();

    const unlisten = await onSpawnWhip(callback);

    expect(listen).toHaveBeenCalledWith('spawn-whip', expect.any(Function));

    // Simulate event emission
    const listenerFn = vi.mocked(listen).mock.calls[0][1];
    listenerFn({ payload: undefined } as any);

    expect(callback).toHaveBeenCalled();
    expect(unlisten).toBe(mockUnlisten);
  });

  it('onConfigUpdated should parse payload with Zod schema', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
    const callback = vi.fn();

    await onConfigUpdated(callback);

    expect(listen).toHaveBeenCalledWith('config-updated', expect.any(Function));

    // Simulate valid partial config event
    const listenerFn = vi.mocked(listen).mock.calls[0][1];
    listenerFn({ payload: { usageCount: 5, todayUsageCount: 2 } } as any);

    expect(callback).toHaveBeenCalledWith({ usageCount: 5, todayUsageCount: 2 });
  });

  it('onConfigUpdated should reject invalid payload', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
    const callback = vi.fn();

    await onConfigUpdated(callback);

    const listenerFn = vi.mocked(listen).mock.calls[0][1];

    // Invalid payload: usageCount is a string instead of number
    expect(() => {
      listenerFn({ payload: { usageCount: 'invalid' } } as any);
    }).toThrow();

    expect(callback).not.toHaveBeenCalled();
  });

  // The Rust command returns Result<(), String>, so a successful call resolves
  // to undefined. Reading a property off that value would throw — this guards
  // against reintroducing a success-flag check.
  it('registerHotkey should resolve when the command succeeds', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await expect(registerHotkey('CommandOrControl+Shift+W')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('register_hotkey', {
      hotkey: 'CommandOrControl+Shift+W',
    });
  });

  it('registerHotkey should reject when the command errors', async () => {
    vi.mocked(invoke).mockRejectedValue('Invalid hotkey format: bogus');
    await expect(registerHotkey('bogus')).rejects.toBeDefined();
  });

  it('listSkins should invoke list_skins and parse each manifest', async () => {
    vi.mocked(invoke).mockResolvedValue([validSkin, { ...validSkin, id: 'fire' }]);
    const skins = await listSkins();
    expect(invoke).toHaveBeenCalledWith('list_skins');
    expect(skins.map((s) => s.id)).toEqual(['default', 'fire']);
  });

  it('listSkins should throw if any manifest fails validation', async () => {
    vi.mocked(invoke).mockResolvedValue([validSkin, { ...validSkin, specVersion: '2' }]);
    await expect(listSkins()).rejects.toThrow();
  });

  it('activateSkin should invoke activate_skin with skinId', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await activateSkin('neon');
    expect(invoke).toHaveBeenCalledWith('activate_skin', { skinId: 'neon' });
  });

  it('onSkinChanged should parse payload and pass the skin id', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
    const callback = vi.fn();

    await onSkinChanged(callback);

    expect(listen).toHaveBeenCalledWith('skin-changed', expect.any(Function));

    const listenerFn = vi.mocked(listen).mock.calls[0][1];
    listenerFn({ payload: { skinId: 'electric' } } as any);

    expect(callback).toHaveBeenCalledWith('electric');
  });

  it('onSkinChanged should reject a payload without skinId', async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
    const callback = vi.fn();

    await onSkinChanged(callback);

    const listenerFn = vi.mocked(listen).mock.calls[0][1];
    expect(() => {
      listenerFn({ payload: { wrongKey: 'electric' } } as any);
    }).toThrow();

    expect(callback).not.toHaveBeenCalled();
  });
});

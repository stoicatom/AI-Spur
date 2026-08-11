import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig, saveConfig, incrementUsage, onSpawnWhip, onConfigUpdated } from '../shared/ipc';
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
});

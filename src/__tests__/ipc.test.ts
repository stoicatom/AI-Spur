import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig, saveConfig } from '../shared/ipc';
import { DEFAULT_CONFIG } from '../shared/config';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

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
});

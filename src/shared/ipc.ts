import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Config, ConfigSchema } from './config';

const PartialConfigSchema = ConfigSchema.partial();

// ============ Commands (TS → Rust) ============

export async function getConfig(): Promise<Config> {
  const raw = await invoke<unknown>('get_config');
  return ConfigSchema.parse(raw);
}

export async function saveConfig(config: Config): Promise<void> {
  return invoke('save_config', { config });
}

export async function registerHotkey(hotkey: string): Promise<void> {
  const result = await invoke<{ success: boolean; error?: string }>('register_hotkey', { hotkey });
  if (!result.success) {
    throw new Error(result.error || 'Failed to register hotkey');
  }
}

export async function triggerMacro(phrase?: string): Promise<void> {
  return invoke('trigger_macro', { phrase });
}

export async function incrementUsage(): Promise<number> {
  return invoke<number>('increment_usage');
}

// ============ Events (Rust → TS) ============

export const Events = {
  SPAWN_WHIP: 'spawn-whip',
  DROP_WHIP: 'drop-whip',
  MODE_CHANGED: 'mode-changed',
  CONFIG_UPDATED: 'config-updated',
} as const;

export function onSpawnWhip(fn: () => void): Promise<UnlistenFn> {
  return listen<void>(Events.SPAWN_WHIP, () => fn());
}

export function onDropWhip(fn: () => void): Promise<UnlistenFn> {
  return listen<void>(Events.DROP_WHIP, () => fn());
}

export function onModeChanged(fn: (mode: string) => void): Promise<UnlistenFn> {
  return listen<{ mode: string }>(Events.MODE_CHANGED, (event) => fn(event.payload.mode));
}

export function onConfigUpdated(fn: (config: Partial<Config>) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.CONFIG_UPDATED, (event) => {
    const validated = PartialConfigSchema.parse(event.payload);
    fn(validated);
  });
}

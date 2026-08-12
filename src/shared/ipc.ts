import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { z } from 'zod';
import { Config, ConfigSchema } from './config';
import { SkinManifest, SkinManifestSchema } from './skins';

const PartialConfigSchema = ConfigSchema.partial();
const SkinChangedPayloadSchema = z.object({ skinId: z.string().min(1) });

// ============ Commands (TS → Rust) ============

export async function getConfig(): Promise<Config> {
  const raw = await invoke<unknown>('get_config');
  return ConfigSchema.parse(raw);
}

export async function saveConfig(config: Config): Promise<void> {
  return invoke('save_config', { config });
}

/**
 * Register the global hotkey.
 *
 * The Rust command returns `Result<(), String>`, so a rejected promise carries
 * the error message — there is no success flag to inspect on the resolved value.
 */
export async function registerHotkey(hotkey: string): Promise<void> {
  return invoke('register_hotkey', { hotkey });
}

export async function triggerMacro(phrase?: string): Promise<void> {
  return invoke('trigger_macro', { phrase });
}

export async function incrementUsage(): Promise<number> {
  return invoke<number>('increment_usage');
}

export async function listSkins(): Promise<SkinManifest[]> {
  const raw = await invoke<unknown[]>('list_skins');
  return raw.map((skin) => SkinManifestSchema.parse(skin));
}

export async function activateSkin(skinId: string): Promise<void> {
  return invoke('activate_skin', { skinId });
}

// ============ Events (Rust → TS) ============

export const Events = {
  SPAWN_WHIP: 'spawn-whip',
  DROP_WHIP: 'drop-whip',
  MODE_CHANGED: 'mode-changed',
  CONFIG_UPDATED: 'config-updated',
  SKIN_CHANGED: 'skin-changed',
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

export function onSkinChanged(fn: (skinId: string) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.SKIN_CHANGED, (event) => {
    const { skinId } = SkinChangedPayloadSchema.parse(event.payload);
    fn(skinId);
  });
}

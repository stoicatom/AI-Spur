import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { z } from 'zod';
import { Config, ConfigSchema } from './config';
import { SkinManifest, SkinManifestSchema } from './skins';
import { Material, MaterialSchema } from './materials';
import { MaterialPack, MaterialPackSchema } from './material-packs';

const PartialConfigSchema = ConfigSchema.partial();
const SkinChangedPayloadSchema = z.object({ skinId: z.string().min(1) });

/** Mirrors `shortcut::ConflictInfo` on the Rust side. */
export const ConflictInfoSchema = z.object({
  hotkey: z.string().min(1),
  suggestions: z.array(z.string().min(1)),
});

export type ConflictInfo = z.infer<typeof ConflictInfoSchema>;

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

/**
 * Check whether a hotkey is already claimed by another application.
 *
 * Resolves to `null` when the hotkey is free (including when AISpur itself
 * already holds it), or conflict details with two suggested alternatives.
 */
export async function checkHotkeyConflict(hotkey: string): Promise<ConflictInfo | null> {
  const raw = await invoke<unknown>('check_hotkey_conflict', { hotkey });
  if (raw === null || raw === undefined) return null;
  return ConflictInfoSchema.parse(raw);
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

// ============ Sound Presets ============

export interface SoundPreset {
  id: string;
  name: string;
  isBuiltin: boolean;
  files: string[];
}

export async function listSoundPresets(): Promise<SoundPreset[]> {
  return invoke<SoundPreset[]>('list_sound_presets');
}

/** 读取某音效包内一个音频文件，返回 data: URI（用于试听 / overlay 播放）。 */
export async function readSoundData(presetId: string, file: string): Promise<string> {
  return invoke<string>('read_sound_data', { presetId, file });
}

export async function setCrackSound(presetId: string): Promise<void> {
  return invoke('set_crack_sound', { presetId });
}

export async function uploadCustomSound(
  sourceDir: string,
  packName: string,
): Promise<SoundPreset> {
  return invoke<SoundPreset>('upload_custom_sound', {
    sourceDir,
    packName,
  });
}

export async function deleteCustomSound(presetId: string): Promise<void> {
  return invoke('delete_custom_sound', { presetId });
}

// ============ Materials ============

/** 列出全部素材：内置矢量 + 内置图片 + 用户自定义图片。 */
export async function listMaterials(): Promise<Material[]> {
  const raw = await invoke<unknown[]>('list_materials');
  return raw.map((m) => MaterialSchema.parse(m));
}

/** 设置活跃素材：Rust 会落盘 config.active_material_id 并 emit material-changed。 */
export async function setActiveMaterial(id: string): Promise<void> {
  return invoke('set_active_material', { id });
}

/**
 * 上传自定义图片素材。
 *
 * `sourcePath` 是用户选择的单个图片文件（png/jpg/jpeg/gif/svg/webp）；
 * Rust 复制到 `app_data_dir()/materials/custom/<slug>/` 并返回新建的 Material。
 */
export async function uploadCustomMaterial(sourcePath: string): Promise<Material> {
  const raw = await invoke<unknown>('upload_custom_material', { sourcePath });
  return MaterialSchema.parse(raw);
}

/** 删除自定义素材（仅限 custom 目录内的素材）。 */
export async function deleteCustomMaterial(id: string): Promise<void> {
  return invoke('delete_custom_material', { id });
}

// ============ Material Packs (v3 single axis) ============

/** 列出全部素材包：内置 + 用户自定义。 */
export async function listPacks(): Promise<MaterialPack[]> {
  const raw = await invoke<unknown[]>('list_packs');
  return raw.map((p) => MaterialPackSchema.parse(p));
}

/** 设置活跃素材包：Rust 落盘 config.active_pack_id 并 emit pack-changed。 */
export async function setActivePack(id: string): Promise<void> {
  return invoke('set_active_pack', { id });
}

/**
 * 创建自定义素材包：上传图标 + 绑定特效预设 + 声音配方 + 配色。
 * Rust 复制图标到 `app_data_dir()/packs/custom/<id>/` 并写 pack.json。
 */
export async function createCustomPack(input: {
  id: string;
  name: string;
  iconPath: string;
  effectPreset: string;
  sound: unknown;
  palette: { bodyGradient: [string, string]; particleHue: number };
}): Promise<MaterialPack> {
  const raw = await invoke<unknown>('create_custom_pack', input);
  return MaterialPackSchema.parse(raw);
}

/** 删除自定义素材包（仅限 custom 目录内的素材包）。 */
export async function deleteCustomPack(id: string): Promise<void> {
  return invoke('delete_custom_pack', { id });
}

// ============ Events (Rust → TS) ============

export const Events = {
  SPAWN_WHIP: 'spawn-whip',
  DROP_WHIP: 'drop-whip',
  CURSOR_POS: 'cursor-pos',
  MODE_CHANGED: 'mode-changed',
  CONFIG_UPDATED: 'config-updated',
  SKIN_CHANGED: 'skin-changed',
  MATERIAL_CHANGED: 'material-changed',
  PACK_CHANGED: 'pack-changed',
} as const;

/**
 * spawn-whip 载荷。
 *
 * `x` / `y` 是 overlay 窗口内的逻辑坐标（Rust 端由光标全局坐标换算而来）；
 * 取不到光标位置时二者省略，下游（overlay/main.ts，WF2）回退到窗口中心。
 */
export const SpawnWhipPayloadSchema = z.object({
  /** True when triggered via the Shift Easter egg — force the full animation. */
  forceFull: z.boolean().default(false),
  x: z.number().optional(),
  y: z.number().optional(),
});

export type SpawnWhipPayload = z.infer<typeof SpawnWhipPayloadSchema>;

export function onSpawnWhip(fn: (payload: SpawnWhipPayload) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.SPAWN_WHIP, (event) => {
    // Rust 可能发送 null / 空对象；用 schema 归一并回退默认值。
    const parsed = SpawnWhipPayloadSchema.safeParse(event.payload ?? {});
    fn(parsed.success ? parsed.data : { forceFull: false });
  });
}

export function onDropWhip(fn: () => void): Promise<UnlistenFn> {
  return listen<void>(Events.DROP_WHIP, () => fn());
}

/**
 * cursor-pos 载荷：overlay 窗口内的逻辑坐标，由 Rust 以 ~60fps 全局读取推送。
 * 让非激活覆盖层无需夺焦点即可让素材跟随光标（消除「必须先点击」）。
 */
const CursorPosPayloadSchema = z.object({ x: z.number(), y: z.number() });
export type CursorPosPayload = z.infer<typeof CursorPosPayloadSchema>;

export function onCursorPos(fn: (pos: CursorPosPayload) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.CURSOR_POS, (event) => {
    const parsed = CursorPosPayloadSchema.safeParse(event.payload);
    if (parsed.success) fn(parsed.data);
  });
}

/** 停止 Rust 侧的光标推送循环（overlay 隐藏 / Esc / crack 收尾后调用）。 */
export async function stopCursorTracking(): Promise<void> {
  return invoke('stop_cursor_tracking');
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

const MaterialChangedPayloadSchema = z.object({ materialId: z.string().min(1) });

export function onMaterialChanged(fn: (materialId: string) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.MATERIAL_CHANGED, (event) => {
    const { materialId } = MaterialChangedPayloadSchema.parse(event.payload);
    fn(materialId);
  });
}

const PackChangedPayloadSchema = z.object({ packId: z.string().min(1) });

/** 素材包切换通知（v3）：overlay 收到后换图标/特效/声音/配色，无需重载。 */
export function onPackChanged(fn: (packId: string) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.PACK_CHANGED, (event) => {
    const { packId } = PackChangedPayloadSchema.parse(event.payload);
    fn(packId);
  });
}

import { invoke } from '@tauri-apps/api/core';

/**
 * Custom skin manifest structure.
 */
export interface CustomSkinManifest {
  id: string;
  name: string;
  image_path?: string;
  sounds: string[];
}

/**
 * List all custom skins installed by the user.
 */
export async function listCustomSkins(): Promise<CustomSkinManifest[]> {
  return invoke<CustomSkinManifest[]>('list_custom_skins');
}

/**
 * Import a custom skin from a local directory.
 * Copies audio files and generates manifest.
 *
 * @param sourceDir - Absolute path to the directory containing audio files
 * @param skinName - Display name for the skin
 * @returns The created skin manifest
 */
export async function importCustomSkin(
  sourceDir: string,
  skinName: string
): Promise<CustomSkinManifest> {
  return invoke<CustomSkinManifest>('import_custom_skin', {
    sourceDir,
    skinName,
  });
}

/**
 * Delete a custom skin by ID.
 * Removes the skin directory and all its files.
 *
 * @param skinId - The skin ID to delete
 */
export async function deleteCustomSkin(skinId: string): Promise<void> {
  return invoke<void>('delete_custom_skin', { skinId });
}

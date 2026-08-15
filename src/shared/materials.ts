import { z } from 'zod';

/**
 * 素材（Material）—— 光标 / 爆裂 的视觉素材。
 *
 * 与「配色皮肤」「音效」两条轴解耦：素材只负责“甩动 / 点击”时呈现的
 * 视觉图形，皮肤负责鞭子配色，音效负责 crack 声。
 *
 * 所有素材均为 **图片**（SVG / 位图）：`imageFile` 为素材目录下的文件名。
 * 内置图片素材来自打包资源目录 `materials/<id>/`，用户自定义图片素材来自
 * `app_data_dir()/materials/custom/<id>/`。每个内置素材在 overlay 里配有
 * 一套专属的 crack 爆裂动画（见 `src/overlay/material-visual.ts`）。
 *
 * Rust 端对应 `materials::Material`（serde rename_all = camelCase），两端字段
 * 必须保持一致。
 */

export const MaterialKindSchema = z.enum(['image']);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

export const MaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: MaterialKindSchema,
  builtin: z.boolean(),
  imageFile: z.string().min(1),
  dataUri: z.string().min(1),
});

export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  builtin: boolean;
  /** 素材目录下的图片文件名。 */
  imageFile: string;
  /** 图片内容的 data: URI（Rust 扫描时内联，规避 asset 协议路径/scope 问题）。 */
  dataUri: string;
}

/**
 * 内置素材 id，与 `src-tauri/materials/<id>/` 目录一一对应。
 * 默认活跃素材为 `rocket`（见 config.ts activeMaterialId 默认值）。
 */
export const BUILTIN_MATERIAL_IDS = [
  'whip',
  'classic',
  'rocket',
  'lightning',
  'flame',
  'star',
  'meteor',
  'skull',
  'crown',
  'sword',
] as const;

export type BuiltinMaterialId = (typeof BUILTIN_MATERIAL_IDS)[number];

/** 默认活跃素材 id。与 Rust config 默认值及 config.ts 保持一致。 */
export const DEFAULT_MATERIAL_ID: BuiltinMaterialId = 'rocket';

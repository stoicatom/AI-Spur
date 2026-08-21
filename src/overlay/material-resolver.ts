import type { MaterialPack } from '../shared/material-packs';
import type { Material } from '../shared/materials';

/** 解析后的渲染指令。所有素材均为图片，`url` 为 data: URI。 */
export type ResolvedMaterial = { kind: 'image'; url: string; id: string };

/** 显式选择缓存中不存在的素材时刷新列表，让刚创建的自定义素材立即生效。 */
export function packListNeedsRefresh(
  packs: MaterialPack[] | null,
  requestedId?: string,
): boolean {
  return packs === null
    || (requestedId !== undefined && !packs.some((pack) => pack.id === requestedId));
}

/** 从素材包列表解析活跃包的图标 URL（v3 主路径）。 */
export function resolvePackMaterial(
  packId: string,
  packs: MaterialPack[],
): ResolvedMaterial {
  const pack = packs.find((item) => item.id === packId)
    ?? packs.find((item) => item.id === 'rocket');
  if (!pack) return { kind: 'image', url: '', id: 'rocket' };
  return { kind: 'image', url: pack.dataUri, id: pack.id };
}

/**
 * 把 activeMaterialId 解析为图片渲染指令（向后兼容旧素材列表）。
 * 未找到时回退到列表里的 rocket；再找不到则返回空。
 */
export function resolveMaterial(
  materialId: string,
  materials: Material[],
): ResolvedMaterial {
  const material = materials.find((item) => item.id === materialId)
    ?? materials.find((item) => item.id === 'rocket');
  if (!material) return { kind: 'image', url: '', id: 'rocket' };
  return { kind: 'image', url: material.dataUri, id: material.id };
}

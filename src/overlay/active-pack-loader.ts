/**
 * 活跃素材包的选取与加载（原 main.ts 的 applyActivePack / Legacy 回退）。
 *
 * 从入口抽出，纯粹是为了守住 main.ts 的行数上限；逻辑与竞态处理保持原样：
 * `revision` 保证后发起的选包请求赢，晚到的旧响应不会覆盖新选择。
 */

import { listPacks, listMaterials, getConfig } from '../shared/ipc';
import {
  packListNeedsRefresh,
  resolveMaterial,
  resolvePackMaterial,
} from './material-visual';
import type { ImageMaterial } from './image-material';
import type { MaterialTrail } from './material-trail';
import { preloadMaterialSound } from './audio-engine';
import type { MaterialPack } from '../shared/material-packs';

export class ActivePackLoader {
  private revision = 0;
  private cache: MaterialPack[] | null = null;
  private current: MaterialPack | null = null;

  constructor(
    private readonly material: ImageMaterial,
    private readonly trail: MaterialTrail,
  ) {}

  /** 当前生效的素材包；未加载完成时为 null。 */
  get activePack(): MaterialPack | null {
    return this.current;
  }

  clearCache(): void {
    this.cache = null;
  }

  async apply(packId?: string): Promise<void> {
    const revision = ++this.revision;
    try {
      let packs = this.cache;
      if (packListNeedsRefresh(packs, packId)) {
        const refreshed = await listPacks();
        if (revision !== this.revision) return;
        this.cache = refreshed;
        packs = refreshed;
      }
      if (!packs) return;
      const config = packId ? null : await getConfig();
      if (revision !== this.revision) return;
      const targetId = packId ?? config?.activePackId ?? 'rocket';
      const pack = packs.find((p) => p.id === targetId) ?? packs.find((p) => p.id === 'rocket');
      if (!pack) return;
      this.current = pack;
      preloadMaterialSound(pack.sound);
      const resolved = resolvePackMaterial(targetId, packs);
      this.material.loadPack(resolved.url, pack.effect.preset, pack.effect.params, pack.palette.particleHue);
      this.trail.setHue(pack.palette.particleHue);
    } catch {
      if (revision === this.revision) await this.applyLegacy(packId);
    }
  }

  /** 向后兼容：当素材包列表空时，回退旧 Material 路径。 */
  async applyLegacy(materialId?: string): Promise<void> {
    try {
      const [config, materials] = await Promise.all([
        materialId ? Promise.resolve(null) : getConfig(),
        listMaterials(),
      ]);
      const targetId = materialId ?? config?.activeMaterialId ?? config?.activePackId ?? 'rocket';
      const resolved = resolveMaterial(targetId, materials);
      this.material.load(resolved.url, resolved.id);
      this.trail.setHue(this.material.hue);
    } catch {}
  }
}

/**
 * CG 场景创建入口：按 packId 查注册表，按画质档位决定是否启用。
 *
 * 设计规格 §4.1 独立性规则 4：低档回退既有程序化 Stage，中高档才创建 CG 场景，
 * 保证动画 / 音效 / 宏发送在任何档位都能工作。返回 null 即「走 legacy」。
 */
import './cg-scenes';
import { resolveScene } from './cg-scene-registry';
import type { CgStage, CgStageContext } from './cg-scene';
import type { EffectQuality } from '../shared/config';

/** 启用 CG 场景的档位。low 不在其中：低端机保底走 legacy 程序化 Stage。 */
const CG_ENABLED_QUALITIES: readonly EffectQuality[] = ['cinematic', 'high', 'medium'];

/** 该档位是否启用 CG 场景。`auto` 由调用方解析为具体档位后传入。 */
export function cgEnabledFor(quality: EffectQuality): boolean {
  return CG_ENABLED_QUALITIES.includes(quality);
}

/**
 * 创建素材专属 CG 场景。
 *
 * 返回 null 的三种情况，调用方一律回退 legacy：
 * 低档位、未注册（用户自定义包）、场景构造抛错。
 */
export function createCgStage(packId: string, ctx: CgStageContext): CgStage | null {
  if (!cgEnabledFor(ctx.quality)) return null;
  const scene = resolveScene(packId);
  if (!scene) return null;
  try {
    return scene.create(ctx);
  } catch (err) {
    // 单个场景的实现错误不能让整个覆盖层黑屏——降级到 legacy 并留下线索。
    console.warn(`CG 场景创建失败，回退 legacy: ${packId}`, err);
    return null;
  }
}

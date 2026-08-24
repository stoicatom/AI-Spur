import type { FamilyContext, FamilyLayer } from './three-family-shared';
import { CrystalShatterWeaponStage, IceBloomWeaponStage } from './three-family-weapon-crystal';
import { RevolverWeaponStage } from './three-family-weapon-firearm';
import { GlassFractureWeaponStage } from './three-family-weapon-fracture';
import { MeleeWeaponStage } from './three-family-weapon-melee';
import { BullwhipWeaponStage } from './three-family-weapon-whip';

function createWeaponStage(ctx: FamilyContext): FamilyLayer {
  switch (ctx.profile.motion) {
    case 'projectile': return new RevolverWeaponStage(ctx);
    case 'fracture': return new GlassFractureWeaponStage(ctx);
    case 'whip': return new BullwhipWeaponStage(ctx);
    case 'shards':
      return Number.isFinite(ctx.params.chill)
        ? new IceBloomWeaponStage(ctx)
        : new CrystalShatterWeaponStage(ctx);
    default: return new MeleeWeaponStage(ctx);
  }
}

/** Routes semantic weapon controls into props with different geometry and timelines. */
export class WeaponFamilyLayer implements FamilyLayer {
  private readonly stage: FamilyLayer;

  constructor(ctx: FamilyContext) {
    this.stage = createWeaponStage(ctx);
  }

  update(t: number, now: number): void {
    this.stage.update(t, now);
  }
}

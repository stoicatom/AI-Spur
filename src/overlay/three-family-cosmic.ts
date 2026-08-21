import type { FamilyContext, FamilyLayer } from './three-family-shared';
import { CometFlybyStage, MeteorImpactStage } from './three-family-cosmic-ballistic';
import { OrbitCosmicStage, SolarGlowStage } from './three-family-cosmic-celestial';
import { PhoenixRiseStage, RocketJetStage } from './three-family-cosmic-flight';
import { MoonPhaseStage } from './three-family-cosmic-moon';
import { SingularityCosmicStage } from './three-family-cosmic-singularity';
import { StarBurstStage, TwinkleFieldStage } from './three-family-cosmic-stars';
import { FireworksCosmicStage, SpiralCosmicStage } from './three-family-cosmic-spectacle';

const hasAnyParam = (ctx: FamilyContext, names: string[]): boolean =>
  names.some((name) => Number.isFinite(ctx.params[name]));

/** Routes cosmic motions and their parameter dialects to distinct stages. */
export class CosmicFamilyLayer implements FamilyLayer {
  private readonly stage: FamilyLayer;

  constructor(ctx: FamilyContext) {
    switch (ctx.profile.motion) {
      case 'thrust': this.stage = new RocketJetStage(ctx); break;
      case 'wing': this.stage = new PhoenixRiseStage(ctx); break;
      case 'ballistic':
        this.stage = hasAnyParam(ctx, ['impact', 'debris', 'trail', 'fallSpeed'])
          ? new MeteorImpactStage(ctx) : new CometFlybyStage(ctx);
        break;
      case 'orbit': this.stage = new OrbitCosmicStage(ctx); break;
      case 'arc': this.stage = new MoonPhaseStage(ctx); break;
      case 'vortex': this.stage = new SpiralCosmicStage(ctx); break;
      case 'pulse': this.stage = new SolarGlowStage(ctx); break;
      case 'radial':
        this.stage = hasAnyParam(ctx, ['points', 'sparkle'])
          ? new StarBurstStage(ctx) : new TwinkleFieldStage(ctx);
        break;
      case 'fireworks': this.stage = new FireworksCosmicStage(ctx); break;
      case 'singularity': this.stage = new SingularityCosmicStage(ctx); break;
      default: this.stage = new TwinkleFieldStage(ctx); break;
    }
  }

  update(t: number, now: number): void { this.stage.update(t, now); }
}

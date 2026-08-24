import type { FamilyContext, FamilyLayer } from './three-family-shared';
import { AirNaturalStage, RainNaturalStage } from './three-family-natural-air';
import { ElectricNaturalStage } from './three-family-natural-electric';
import { FlameNaturalStage, SplashNaturalStage } from './three-family-natural-elements';
import { ExtremeNaturalStage } from './three-family-natural-extreme';
import { PetalNaturalStage } from './three-family-natural-petal';
import { WaveNaturalStage } from './three-family-natural-wave';
import { DownpourNaturalStage } from './three-family-natural-rainstorm';

/** Routes every natural motion to its own geometry and physical timeline. */
export class NaturalFamilyLayer implements FamilyLayer {
  private readonly stage: FamilyLayer;

  constructor(ctx: FamilyContext) {
    switch (ctx.profile.motion) {
      case 'electric': this.stage = new ElectricNaturalStage(ctx); break;
      case 'wave': this.stage = new WaveNaturalStage(ctx); break;
      case 'flame': this.stage = new FlameNaturalStage(ctx); break;
      case 'splash': this.stage = new SplashNaturalStage(ctx); break;
      case 'vortex': this.stage = new AirNaturalStage(ctx); break;
      case 'petal': this.stage = new PetalNaturalStage(ctx); break;
      case 'rain': this.stage = new RainNaturalStage(ctx); break;
      case 'downpour': this.stage = new DownpourNaturalStage(ctx); break;
      case 'tornado': case 'wildfire': this.stage = new ExtremeNaturalStage(ctx); break;
      default: this.stage = new AirNaturalStage(ctx); break;
    }
  }

  update(t: number, now: number): void { this.stage.update(t, now); }
}

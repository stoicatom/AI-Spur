import type { FamilyContext, FamilyLayer } from './three-family-shared';
import { BombImpactScene, SpectralImpactScene } from './three-family-impact-blast';
import {
  AxeImpactScene,
  BoxingImpactScene,
  ShieldImpactScene,
} from './three-family-impact-kinetic';
import { DrumImpactScene, ThunderImpactScene } from './three-family-impact-wave';

function createImpactScene(ctx: FamilyContext): FamilyLayer {
  const { params, profile } = ctx;
  if (profile.motion === 'boxing') return new BoxingImpactScene(ctx);
  if (Number.isFinite(params.blast)) return new BombImpactScene(ctx);
  if (Number.isFinite(params.chop)) return new AxeImpactScene(ctx);
  if (Number.isFinite(params.block)) return new ShieldImpactScene(ctx);
  if (Number.isFinite(params.bass)) return new DrumImpactScene(ctx);
  if (Number.isFinite(params.expansion)) return new ThunderImpactScene(ctx);
  return new SpectralImpactScene(ctx);
}

/** Routes impact presets by their physical controls, not by a shared burst template. */
export class ImpactFamilyLayer implements FamilyLayer {
  private readonly scene: FamilyLayer;

  constructor(ctx: FamilyContext) {
    this.scene = createImpactScene(ctx);
  }

  update(t: number, now: number): void {
    this.scene.update(t, now);
  }
}

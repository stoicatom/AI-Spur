import type { FamilyContext, FamilyLayer } from './three-family-shared';
import { BellRhythmStage, TrumpetRhythmStage } from './three-family-rhythm-brass';
import { GuitarRhythmStage } from './three-family-rhythm-guitar';
import { PianoRhythmStage, SaxRhythmStage } from './three-family-rhythm-melody';
import { DrumRhythmStage, GrooveRhythmStage } from './three-family-rhythm-percussion';

/** Dispatches rhythm presets to instrument-specific 3D stages. */
export class RhythmFamilyLayer implements FamilyLayer {
  private readonly stage: FamilyLayer;

  constructor(ctx: FamilyContext) {
    if (ctx.profile.motion === 'groove') this.stage = new GrooveRhythmStage(ctx);
    else if (ctx.profile.motion === 'drum') this.stage = new DrumRhythmStage(ctx);
    else if (ctx.profile.motion === 'melody' && Number.isFinite(ctx.params.keyCount)) this.stage = new PianoRhythmStage(ctx);
    else if (ctx.profile.motion === 'melody') this.stage = new SaxRhythmStage(ctx);
    else if (Number.isFinite(ctx.params.echoes)) this.stage = new BellRhythmStage(ctx);
    else if (Number.isFinite(ctx.params.fanfare)) this.stage = new TrumpetRhythmStage(ctx);
    else this.stage = new GuitarRhythmStage(ctx);
  }

  update(t: number, now: number): void { this.stage.update(t, now); }
}

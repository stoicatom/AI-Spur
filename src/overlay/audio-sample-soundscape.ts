import type { EffectPresetId } from '../shared/material-packs';

export type SampleSoundscapeProfile = Readonly<{
  dry: number;
  body: number;
  presence: number;
  space: number;
  lowpass: number;
  highpass: number;
  leftDelay: number;
  rightDelay: number;
}>;

const HEAVY = new Set<EffectPresetId>([
  'burst', 'shock-ring', 'impact', 'explode', 'boxing', 'singularity', 'drum-beat',
]);
const SHARP = new Set<EffectPresetId>([
  'bolt', 'orbit', 'dash', 'shatter', 'shatter-ice', 'arc', 'gunshot', 'glass-break', 'whip-crack',
]);
const RHYTHM = new Set<EffectPresetId>([
  'pulse', 'ring', 'echo', 'note-dance', 'groove', 'drum-beat',
]);

const PROFILES = {
  heavy: { dry: 0.58, body: 0.23, presence: 0.12, space: 0.075, lowpass: 260, highpass: 2100, leftDelay: 0.026, rightDelay: 0.043 },
  sharp: { dry: 0.62, body: 0.13, presence: 0.2, space: 0.07, lowpass: 320, highpass: 1700, leftDelay: 0.021, rightDelay: 0.036 },
  rhythm: { dry: 0.66, body: 0.16, presence: 0.14, space: 0.085, lowpass: 300, highpass: 1900, leftDelay: 0.032, rightDelay: 0.052 },
  expansive: { dry: 0.6, body: 0.17, presence: 0.14, space: 0.09, lowpass: 280, highpass: 1850, leftDelay: 0.037, rightDelay: 0.059 },
} as const satisfies Record<string, SampleSoundscapeProfile>;

export function sampleSoundscapeProfileFor(preset: EffectPresetId): SampleSoundscapeProfile {
  if (SHARP.has(preset)) return PROFILES.sharp;
  if (HEAVY.has(preset)) return PROFILES.heavy;
  if (RHYTHM.has(preset)) return PROFILES.rhythm;
  return PROFILES.expansive;
}

function setGain(node: GainNode, value: number, now: number): void {
  node.gain.setValueAtTime(value, now);
}

/** Fans one real recording into controlled body, transient and stereo-space buses. */
export function connectSampleSoundscape(
  ac: AudioContext,
  source: AudioBufferSourceNode,
  master: AudioNode,
  preset: EffectPresetId,
  panValue: number,
  now: number,
): AudioNode[] {
  const profile = sampleSoundscapeProfileFor(preset);
  const dry = ac.createGain(); const body = ac.createGain(); const presence = ac.createGain();
  const bodyFilter = ac.createBiquadFilter(); const presenceFilter = ac.createBiquadFilter();
  const center = ac.createStereoPanner(); const spaceTone = ac.createBiquadFilter();
  const leftDelay = ac.createDelay(0.12); const rightDelay = ac.createDelay(0.12);
  const leftGain = ac.createGain(); const rightGain = ac.createGain();
  const leftPan = ac.createStereoPanner(); const rightPan = ac.createStereoPanner();

  setGain(dry, profile.dry, now); setGain(body, profile.body, now);
  setGain(presence, profile.presence, now); setGain(leftGain, profile.space, now);
  setGain(rightGain, profile.space, now);
  bodyFilter.type = 'lowpass'; bodyFilter.frequency.setValueAtTime(profile.lowpass, now);
  bodyFilter.Q.setValueAtTime(0.72, now);
  presenceFilter.type = 'highpass'; presenceFilter.frequency.setValueAtTime(profile.highpass, now);
  presenceFilter.Q.setValueAtTime(0.66, now);
  spaceTone.type = 'lowpass'; spaceTone.frequency.setValueAtTime(7200, now);
  spaceTone.Q.setValueAtTime(0.55, now);
  center.pan.setValueAtTime(panValue, now);
  leftPan.pan.setValueAtTime(Math.max(-1, panValue - 0.68), now);
  rightPan.pan.setValueAtTime(Math.min(1, panValue + 0.68), now);
  leftDelay.delayTime.setValueAtTime(profile.leftDelay, now);
  rightDelay.delayTime.setValueAtTime(profile.rightDelay, now);

  source.connect(dry); dry.connect(center);
  source.connect(bodyFilter); bodyFilter.connect(body); body.connect(center);
  source.connect(presenceFilter); presenceFilter.connect(presence); presence.connect(center);
  center.connect(master);
  source.connect(spaceTone); spaceTone.connect(leftDelay); spaceTone.connect(rightDelay);
  leftDelay.connect(leftGain); leftGain.connect(leftPan); leftPan.connect(master);
  rightDelay.connect(rightGain); rightGain.connect(rightPan); rightPan.connect(master);
  return [dry, body, presence, bodyFilter, presenceFilter, center, spaceTone,
    leftDelay, rightDelay, leftGain, rightGain, leftPan, rightPan];
}

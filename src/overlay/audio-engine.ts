import type { EffectPresetId, SoundRecipe } from '../shared/material-packs';
import { disposeAudioContext, getAudioContext, resumeAudioContext } from './audio-context';
import { renderSemanticPlan, type AcousticSpatialOptions } from './audio-graph';
import { AudioPlaybackRegistry } from './audio-lifecycle';
import { connectSampleSoundscape } from './audio-sample-soundscape';
import { createSemanticSoundPlan } from './audio-semantics';

const activePlaybacks = new AudioPlaybackRegistry(disposeAudioContext);
const sampleBuffers = new Map<string, Promise<AudioBuffer>>();

export interface MaterialSoundOptions extends AcousticSpatialOptions {
  globalVolume?: number;
  random?: () => number;
}

function decodeSample(dataUri: string): Promise<AudioBuffer> {
  const cached = sampleBuffers.get(dataUri);
  if (cached) return cached;
  const audioContext = getAudioContext();
  const decoded = fetch(dataUri)
    .then((response) => {
      if (!response.ok) throw new Error(`audio asset response ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => audioContext.decodeAudioData(bytes));
  sampleBuffers.set(dataUri, decoded);
  decoded.catch(() => sampleBuffers.delete(dataUri));
  return decoded;
}

/** 在素材激活时提前解码，避免首次挥动等待音频解码。 */
export function preloadMaterialSound(recipe: SoundRecipe): void {
  if (recipe.sample?.dataUri) void decodeSample(recipe.sample.dataUri).catch(() => {});
}

function spatialPan(options: AcousticSpatialOptions): number {
  if (options.x === undefined || !options.viewportWidth) return 0;
  const position = options.x / Math.max(1, options.viewportWidth) * 2 - 1;
  const velocity = Math.max(-1, Math.min(1, (options.velocityX ?? 0) / 5200));
  return Math.max(-1, Math.min(1, position * .72 + velocity * .18));
}

async function playSample(
  preset: EffectPresetId, recipe: SoundRecipe, options: MaterialSoundOptions,
): Promise<void> {
  const sample = recipe.sample;
  if (!sample?.dataUri) throw new Error('audio sample data is unavailable');
  const buffer = await decodeSample(sample.dataUri);
  const ac = getAudioContext();
  const now = ac.currentTime;
  const source = ac.createBufferSource();
  const master = ac.createGain();
  const compressor = ac.createDynamicsCompressor();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(1, now);
  const speedGain = .9 + Math.min(.1, Math.max(0, options.velocitySpeed ?? 0) / 9000);
  master.gain.setValueAtTime(
    Math.max(0, recipe.masterGain * sample.gain * (options.globalVolume ?? 1) * speedGain),
    now,
  );
  compressor.threshold.setValueAtTime(-12, now);
  compressor.knee.setValueAtTime(16, now);
  compressor.ratio.setValueAtTime(9, now);
  compressor.attack.setValueAtTime(.0015, now);
  compressor.release.setValueAtTime(.18, now);
  const soundscapeNodes = connectSampleSoundscape(
    ac, source, master, preset, spatialPan(options), now,
  );
  master.connect(compressor);
  compressor.connect(ac.destination);
  const duration = Math.min(buffer.duration, sample.maxDuration);
  let release: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  release = activePlaybacks.track(() => {
    if (timer !== null) clearTimeout(timer);
    try { source.stop(); } catch {}
    disconnect([source, ...soundscapeNodes, master, compressor]);
  });
  source.start(now, 0, duration);
  const armCleanup = () => { timer = setTimeout(() => release?.(), (duration + .2) * 1000); };
  if (ac.state === 'suspended') {
    void resumeAudioContext(ac).then(armCleanup, () => release?.());
  } else {
    armCleanup();
  }
}

function disconnect(nodes: AudioNode[]): void {
  for (const node of nodes) {
    try { node.disconnect(); } catch { /* graph may already be detached */ }
  }
}

function stop(sources: AudioScheduledSourceNode[]): void {
  for (const source of sources) {
    try { source.stop(); } catch { /* source may already be stopped */ }
  }
}

/**
 * Play a material by semantic identity. The manifest recipe remains the volume
 * and custom-pack fallback, while built-ins use material-specific acoustic
 * events aligned to their visual stages.
 */
export function playMaterialSound(
  packId: string,
  preset: EffectPresetId,
  recipe: SoundRecipe,
  options: MaterialSoundOptions = {},
): void {
  if (recipe.sample) {
    void playSample(preset, recipe, options).catch(() => {});
    return;
  }
  playSynthesizedSound(packId, preset, recipe, options);
}

function playSynthesizedSound(
  packId: string,
  preset: EffectPresetId,
  recipe: SoundRecipe,
  options: MaterialSoundOptions,
): void {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let release: (() => void) | null = null;
  let disposed = false;
  try {
    const ac = getAudioContext();
    const now = ac.currentTime;
    const master = ac.createGain();
    const compressor = ac.createDynamicsCompressor();
    const plan = createSemanticSoundPlan(packId, preset, recipe);
    const speedGain = .86 + Math.min(.14, Math.max(0, options.velocitySpeed ?? 0) / 9000);
    master.gain.setValueAtTime(
      Math.max(0, plan.masterGain * (options.globalVolume ?? 1) * speedGain),
      now,
    );
    compressor.threshold.setValueAtTime(-13, now);
    compressor.knee.setValueAtTime(20, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(.0015, now);
    compressor.release.setValueAtTime(.2, now);
    master.connect(compressor);
    compressor.connect(ac.destination);
    nodes.push(master, compressor);
    const graph = renderSemanticPlan(ac, master, plan, options, options.random);
    nodes.push(...graph.nodes);
    sources.push(...graph.sources);
    release = activePlaybacks.track(() => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      stop(sources);
      disconnect(nodes);
    });
    const armCleanup = () => {
      if (!disposed && release) timer = setTimeout(release, (graph.duration + .35) * 1000);
    };
    if (ac.state === 'suspended') {
      void resumeAudioContext(ac).then(armCleanup, () => release?.());
    } else {
      armCleanup();
    }
  } catch {
    if (release) release();
    else {
      stop(sources);
      disconnect(nodes);
    }
  }
}

/** Compatibility entry point for custom and legacy callers. */
export function playRecipe(recipe: SoundRecipe, globalVolume = 1): void {
  playMaterialSound('custom', 'impact', recipe, { globalVolume });
}

/** Overlay 隐藏后保留尾音，最后一个图表自行释放时再关闭上下文。 */
export function releaseAudioContextWhenIdle(): void {
  activePlaybacks.releaseContextWhenIdle();
}

/** HMR / 应用退出时调用，立即停止并释放所有图表。 */
export function closeAudioContext(): void {
  sampleBuffers.clear();
  activePlaybacks.forceClose();
}

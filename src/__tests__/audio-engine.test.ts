import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeAudioContext,
  playMaterialSound,
  playRecipe,
  releaseAudioContextWhenIdle,
} from '../overlay/audio-engine';
import type { SoundRecipe } from '../shared/material-packs';

function param(): AudioParam {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  } as unknown as AudioParam;
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSource extends FakeNode {
  loop = false;
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState: AudioContextState = 'running';
  static resumeGate: Promise<void> | null = null;
  readonly destination = new FakeNode() as unknown as AudioDestinationNode;
  readonly sampleRate = 12;
  readonly sources: FakeSource[] = [];
  currentTime = 0;
  state: AudioContextState = FakeAudioContext.initialState;
  close = vi.fn(async () => { this.state = 'closed'; });
  resume = vi.fn(async () => {
    if (FakeAudioContext.resumeGate) await FakeAudioContext.resumeGate;
    this.state = 'running';
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createBuffer(_channels: number, length: number): AudioBuffer {
    return { getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
  }

  createGain(): GainNode {
    return Object.assign(new FakeNode(), { gain: param() }) as unknown as GainNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return Object.assign(new FakeNode(), {
      threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    }) as unknown as DynamicsCompressorNode;
  }

  createOscillator(): OscillatorNode {
    const source = Object.assign(new FakeSource(), { frequency: param(), type: 'sine' });
    this.sources.push(source);
    return source as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = Object.assign(new FakeSource(), { buffer: null, playbackRate: param() });
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return Object.assign(new FakeNode(), { frequency: param(), Q: param() }) as unknown as BiquadFilterNode;
  }

  createWaveShaper(): WaveShaperNode {
    return Object.assign(new FakeNode(), { curve: null, oversample: 'none' }) as unknown as WaveShaperNode;
  }

  createStereoPanner(): StereoPannerNode {
    return Object.assign(new FakeNode(), { pan: param() }) as unknown as StereoPannerNode;
  }

  createDelay(): DelayNode {
    return Object.assign(new FakeNode(), { delayTime: param() }) as unknown as DelayNode;
  }
}

const LONG_CHIME: SoundRecipe = {
  masterGain: 0.8,
  layers: [{ type: 'chime', attack: 0.1, decay: 2.5, gain: 0.5, delay: 0 }],
};

const SHORT_NOISE: SoundRecipe = {
  masterGain: 0.6,
  layers: [{ type: 'noise', attack: 0.02, decay: 0.08, gain: 0.5, delay: 0 }],
};

const LONG_NOISE: SoundRecipe = {
  masterGain: 0.6,
  layers: [{ type: 'noise', attack: 0.02, decay: 2.6, gain: 0.5, delay: 0 }],
};

function currentContext(): FakeAudioContext {
  const context = FakeAudioContext.instances.at(-1);
  if (!context) throw new Error('expected an audio context');
  return context;
}

describe('程序化声音引擎生命周期', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = 'running';
    FakeAudioContext.resumeGate = null;
    vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext);
  });

  afterEach(() => {
    closeAudioContext();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('隐藏覆盖层后会等待语义图表自然结束才关闭上下文', () => {
    playRecipe(LONG_CHIME);
    const context = currentContext();

    releaseAudioContextWhenIdle();
    vi.runAllTimers();

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.sources.every((source) => source.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it('重叠触发时等待最后一个素材声音结束再关闭', () => {
    playRecipe(SHORT_NOISE);
    const context = currentContext();
    releaseAudioContextWhenIdle();
    playRecipe(LONG_CHIME);

    vi.advanceTimersByTime(700);

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(context.close).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2800);

    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('长噪声音层不会受缓存长度限制而提前停止', () => {
    playRecipe(LONG_NOISE);
    const context = currentContext();

    expect(context.sources.some((source) => source.loop)).toBe(true);
    const scheduledStops = context.sources.map((source) => source.stop.mock.calls[0]?.[0]);
    expect(scheduledStops.every((time) => time > 2.6)).toBe(true);

    releaseAudioContextWhenIdle();
    vi.runAllTimers();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('语义播放会按视觉阶段安排声音源，并接收空间参数', () => {
    playMaterialSound('fireworks', 'fireworks', SHORT_NOISE, {
      x: 960,
      viewportWidth: 1920,
      velocityX: 1,
      velocitySpeed: 4200,
      random: () => .5,
    });
    const context = currentContext();
    const starts = context.sources.map((source) => source.start.mock.calls[0]?.[0]);

    expect(starts).toContain(.741);
    expect(context.sources.length).toBeGreaterThan(5);
  });

  it('上下文挂起时等待恢复后才启动墙钟清理', async () => {
    let resume!: () => void;
    FakeAudioContext.initialState = 'suspended';
    FakeAudioContext.resumeGate = new Promise<void>((resolve) => { resume = resolve; });
    playMaterialSound('fireworks', 'fireworks', SHORT_NOISE, { random: () => .5 });
    const context = currentContext();

    releaseAudioContextWhenIdle();
    vi.advanceTimersByTime(10_000);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.close).not.toHaveBeenCalled();

    resume();
    await FakeAudioContext.resumeGate;
    await Promise.resolve();
    vi.runAllTimers();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('强制停止后重播会创建新上下文且两个图表都完全断开', () => {
    playMaterialSound('thunder', 'shock-ring', SHORT_NOISE, { random: () => .5 });
    const first = currentContext();
    closeAudioContext();
    playMaterialSound('lightning', 'bolt', SHORT_NOISE, { random: () => .5 });
    const second = currentContext();
    closeAudioContext();

    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(first.sources.every((source) => source.disconnect.mock.calls.length > 0)).toBe(true);
    expect(second.sources.every((source) => source.disconnect.mock.calls.length > 0)).toBe(true);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it('强制关闭立即停止图表，并且后续定时器不会重复关闭', () => {
    playRecipe(LONG_CHIME);
    const context = currentContext();

    closeAudioContext();
    vi.runAllTimers();

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.sources.every((source) => source.stop.mock.calls.length > 1)).toBe(true);
  });
});

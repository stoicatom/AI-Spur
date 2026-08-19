/**
 * 程序化声音引擎 —— 基于 Web Audio API 的多层合成器。
 *
 * 设计目标：
 *  - 零音频文件：所有声音由 SoundRecipe（配方）程序化合成，安装包不增加体积
 *  - 多层音色：主击 + 共鸣 + 余韵，每次触发有微小随机变体（防重复感）
 *  - 资源安全：每次播放完后自动断开所有 AudioNode，无内存泄漏
 *  - 性能友好：AudioContext 懒加载，节点在触发时创建，播放完即销毁
 *
 * 合成层类型（对应 SoundLayerType）：
 *  - noise:   白噪声/粉噪声 burst（爆炸/打击）
 *  - tone:    振荡器音调（金属/钟）
 *  - sweep:   频率扫掠（呼啸/下坠）
 *  - impact:  低频脉冲（重击/震地）
 *  - chime:   高泛音钟声（铃/水晶）
 *  - rumble:  低频轰鸣（雷/鼓共鸣）
 */

import type { SoundRecipe, SoundLayer } from '../shared/material-packs';

// ── AudioContext 单例（懒加载）───────────────────────────────────────────────

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
  }
  // 部分浏览器在未交互时挂起 AudioContext
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

// ── 噪声缓冲（白噪声 / 粉噪声，复用避免重复分配）────────────────────────────

let whiteNoiseBuffer: AudioBuffer | null = null;
let pinkNoiseBuffer: AudioBuffer | null = null;

const NOISE_DURATION = 2; // 秒

function buildNoiseBuffer(ac: AudioContext, pink: boolean): AudioBuffer {
  const length = Math.ceil(NOISE_DURATION * ac.sampleRate);
  const buf = ac.createBuffer(1, length, ac.sampleRate);
  const data = buf.getChannelData(0);
  if (!pink) {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    // Paul Kellet 粉噪声公式
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

function getNoiseBuffer(ac: AudioContext, pink: boolean): AudioBuffer {
  if (pink) {
    if (!pinkNoiseBuffer) pinkNoiseBuffer = buildNoiseBuffer(ac, true);
    return pinkNoiseBuffer;
  }
  if (!whiteNoiseBuffer) whiteNoiseBuffer = buildNoiseBuffer(ac, false);
  return whiteNoiseBuffer;
}

// ── 层合成器 ─────────────────────────────────────────────────────────────────

/**
 * 合成一个声音层，返回「所有已创建节点」数组（用于播放完后批量断开）。
 * 变体抖动：每个数值参数乘以 [0.92, 1.08] 内的随机因子，防重复感。
 */
function synthLayer(
  ac: AudioContext,
  master: GainNode,
  layer: SoundLayer,
  startTime: number,
): AudioNode[] {
  const nodes: AudioNode[] = [];
  const jitter = () => 0.92 + Math.random() * 0.16;

  const gainNode = ac.createGain();
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(layer.gain * jitter(), startTime + layer.attack);
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    startTime + layer.attack + layer.decay * jitter(),
  );

  let source: AudioNode;

  if (layer.type === 'noise' || layer.type === 'impact') {
    const noiseColor = layer.noiseColor ?? 'white';
    const buf = getNoiseBuffer(ac, noiseColor === 'pink');
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = false;
    const end = startTime + layer.attack + layer.decay + 0.1;
    src.start(startTime);
    src.stop(end);
    source = src;
    nodes.push(src);
  } else {
    // tone / sweep / chime / rumble: 振荡器
    const osc = ac.createOscillator();
    const oscType = layer.osc?.type ?? (layer.type === 'chime' ? 'sine' : 'sawtooth');
    osc.type = oscType as OscillatorType;
    const baseFreq = (layer.osc?.freq ?? 220) * jitter();
    osc.frequency.setValueAtTime(baseFreq, startTime);
    if (layer.osc?.freqEnd !== undefined) {
      const endFreq = layer.osc.freqEnd * jitter();
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(10, endFreq),
        startTime + layer.attack + layer.decay,
      );
    }
    const end = startTime + layer.attack + layer.decay + 0.1;
    osc.start(startTime);
    osc.stop(end);
    source = osc;
    nodes.push(osc);
  }

  // 可选滤波器
  if (layer.filter) {
    const filter = ac.createBiquadFilter();
    filter.type = layer.filter.type as BiquadFilterType;
    filter.frequency.setValueAtTime(layer.filter.freq * jitter(), startTime);
    if (layer.filter.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(10, layer.filter.freqEnd * jitter()),
        startTime + layer.attack + layer.decay,
      );
    }
    filter.Q.setValueAtTime(layer.filter.q ?? 1, startTime);
    source.connect(filter);
    filter.connect(gainNode);
    nodes.push(filter);
  } else {
    source.connect(gainNode);
  }

  // 延迟（echo 类预设）
  const delay = layer.delay ?? 0;
  if (delay > 0) {
    const delayNode = ac.createDelay(delay + 0.1);
    delayNode.delayTime.setValueAtTime(delay, startTime);
    gainNode.connect(delayNode);
    delayNode.connect(master);
    nodes.push(delayNode);
  } else {
    gainNode.connect(master);
  }

  nodes.push(gainNode);
  return nodes;
}

// ── 主接口 ───────────────────────────────────────────────────────────────────

/**
 * 播放一个 SoundRecipe（素材包的程序化声音配方）。
 *
 * 内部流程：
 * 1. 获取（或恢复）AudioContext
 * 2. 创建 master GainNode（globalVolume）
 * 3. 为每个 layer 合成一套节点链
 * 4. 计算总时长 + 安全边距 → schedule 自动断开所有节点释放资源
 */
export function playRecipe(recipe: SoundRecipe, globalVolume = 1): void {
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(recipe.masterGain * globalVolume, now);
    master.connect(ac.destination);

    let maxDuration = 0;
    const allNodes: AudioNode[] = [master];

    for (const layer of recipe.layers) {
      const layerNodes = synthLayer(ac, master, layer, now);
      allNodes.push(...layerNodes);
      const dur = (layer.delay ?? 0) + layer.attack + layer.decay;
      if (dur > maxDuration) maxDuration = dur;
    }

    // 播放结束后断开所有节点，防止内存泄漏
    const cleanup = maxDuration + 0.3; // 安全边距
    setTimeout(() => {
      for (const node of allNodes) {
        try {
          node.disconnect();
        } catch {
          // 节点可能已被自动回收
        }
      }
    }, cleanup * 1000);
  } catch {
    // Web Audio 不可用（如测试环境）时静默失败
  }
}

/**
 * 关闭并释放 AudioContext（应用退出 / 覆盖层隐藏时调用）。
 * 下次 playRecipe 会重新创建一个新的 Context。
 */
export function closeAudioContext(): void {
  if (ctx && ctx.state !== 'closed') {
    ctx.close().catch(() => {});
    ctx = null;
  }
  // 清空噪声缓冲（隐藏窗口时释放内存）
  whiteNoiseBuffer = null;
  pinkNoiseBuffer = null;
}

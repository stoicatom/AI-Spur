/**
 * 图片素材的加载 / 缓存 / 绘制（与配色皮肤、音效解耦）。
 *
 * 职责：
 *  - `resolveMaterial`：把 config.activeMaterialId + Material[] 解析为图片 URL
 *    渲染指令（纯函数，无副作用）。
 *  - `MaterialTrail`：能量拖尾。记录素材最近的历史位置，甩得越快拖尾越长越亮，
 *    给「甩动」一个可见的速度反馈。
 *  - `ImageMaterial`：持有一张预加载的素材精灵，负责光标跟随绘制，以及
 *    **与素材强关联的专属爆裂动画**（火箭升空、闪电劈裂、火焰上腾……）。
 *
 * 帧循环内只做 drawImage / 画粒子，图片仅在 `load()` 时解码一次，满足 60fps。
 */
import type { Material } from '../shared/materials';
import { DEFAULT_VEL, type WhipVel, drawImpact } from './particles';
import { crackStyle, type CrackStyle } from './material-styles';

export type { CrackStyle } from './material-styles';

const TAU = Math.PI * 2;
const CURSOR_MAX_PX = 96; // 光标精灵最长边（放大以增强视觉冲击）
const CRACK_MS = 1200; // 爆裂动画时长
// const MAX_PARTICLES = 50; // 每次发射的粒子上限
// const FRAME_BUDGET_US = 8000; // 单帧CPU预算（8ms @ 120Hz）
// 预计算HSL颜色缓存（0-359色相→CSS字符串），避免每帧每粒子拼接
const HSL_DOT_CACHE: string[] = [];
const HSL_STREAK_CACHE: string[] = [];
const HSL_SHARD_CACHE: string[] = [];
for (let h = 0; h < 360; h++) {
  HSL_DOT_CACHE[h] = `hsl(${h},100%,62%)`;
  HSL_STREAK_CACHE[h] = `hsl(${h},100%,66%)`;
  HSL_SHARD_CACHE[h] = `hsl(${h},90%,58%)`;
}

/** 解析后的渲染指令。所有素材均为图片，`url` 为 data: URI。 */
export type ResolvedMaterial = { kind: 'image'; url: string; id: string };

/**
 * 把 activeMaterialId 解析为图片渲染指令（url 为 Rust 内联的 data: URI）。
 * 未找到时回退到列表里的 rocket；再找不到则返回空（调用方保持上一帧素材）。
 */
export function resolveMaterial(materialId: string, materials: Material[]): ResolvedMaterial {
  const m = materials.find((x) => x.id === materialId) ?? materials.find((x) => x.id === 'rocket');
  if (!m) return { kind: 'image', url: '', id: 'rocket' };
  return { kind: 'image', url: m.dataUri, id: m.id };
}

function fitSize(img: HTMLImageElement, max: number): { w: number; h: number } {
  const iw = img.naturalWidth || max;
  const ih = img.naturalHeight || max;
  const scale = max / Math.max(iw, ih);
  return { w: iw * scale, h: ih * scale };
}

// ── 能量拖尾 ────────────────────────────────────────────────────────────────

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * 素材跟随时的能量拖尾。环形缓冲最近的位置点，按 age 递减 alpha/宽度绘制，
 * 甩得越快点距越大 → 拖尾越长。纯 canvas 折线，无逐帧分配。
 *
 * 用**定长对象数组 + 头/尾游标**实现，而非 `push`/`shift`：跟随阶段每帧
 * 记一个点，环形缓冲避免每帧分配新 TrailPoint 对象，也让丢弃最旧点是 O(1)。
 */
export class MaterialTrail {
  private points: TrailPoint[] = [];
  private head = 0; // 最旧点的下标（环形 write 游标 = 最旧点位置）。
  private count = 0;
  private readonly max = 14;
  private hue = 24;

  /** 素材切换时设定拖尾色相（与素材呼应）。 */
  setHue(hue: number): void {
    this.hue = hue;
  }

  clear(): void {
    this.count = 0;
  }

  push(x: number, y: number, now: number): void {
    // 环形缓冲里最旧的下标。count 不足满时，write 落在 count 之后（即物理下标
    // = count）。
    const writeAt = this.count < this.max ? this.count : this.head;
    // 仅在移动足够时记点，避免静止时堆叠（与原 push/shift 语义一致）。
    if (this.count > 0) {
      const last = this.points[(writeAt + this.max - 1) % this.max];
      if (last && Math.hypot(x - last.x, y - last.y) < 4) return;
    }
    const p = this.points[writeAt] ?? (this.points[writeAt] = { x: 0, y: 0, t: 0 });
    p.x = x;
    p.y = y;
    p.t = now;
    if (this.count < this.max) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.max;
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.count < 2) return;
    // 从最旧到最新遍历段（首尾相接的环形里的连续区间）。
    // 老点在 220ms 后淡尽。
    for (let k = 1; k < this.count; k++) {
      const a = this.points[(this.head + k - 1) % this.max];
      const b = this.points[(this.head + k) % this.max];
      const age = now - b.t;
      const life = Math.max(0, 1 - age / 220);
      if (life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = life * 0.5 * (k / this.count);
      ctx.strokeStyle = `hsl(${this.hue}, 100%, 62%)`;
      ctx.lineWidth = 10 * life * (k / this.count);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── 专属爆裂动画 ────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  hue: number;
  gravity: number;
  shape: 0 | 1 | 2;
  angle: number;
}


/**
 * 一张图片素材精灵。同一 URL 重复 `load` 不重新解码。
 * crack 时按 materialId 播放专属爆裂动画。
 */
export class ImageMaterial {
  private img = new Image();
  private ready = false;
  private url = '';
  /** 精灵适配后的绘制尺寸，load 成功时缓存一次，避免帧内重复计算。 */
  private fitW = 0;
  private fitH = 0;

  private crackT0 = 0;
  private crackX = 0;
  private crackY = 0;
  private crackOn = false;
  private crackVel: WhipVel = DEFAULT_VEL;
  private style: CrackStyle = crackStyle('rocket');
  private particles: Particle[] = [];

  /** 预加载图片（仅在 URL 变化时触发一次解码）。 */
  load(url: string, id: string): void {
    this.style = crackStyle(id);
    if (url === this.url) return;
    this.url = url;
    this.ready = false;
    if (!url) return; // 空 url（解析失败回退）：保持未就绪，帧循环不绘制。
    const img = new Image();
    img.onload = () => {
      if (this.url === url) {
        this.img = img;
        this.ready = true;
        const s = fitSize(img, CURSOR_MAX_PX);
        this.fitW = s.w;
        this.fitH = s.h;
      }
    };
    img.onerror = () => {
      if (this.url === url) this.ready = false;
    };
    img.src = url;
  }

  /** 拖尾主色相，随素材切换。 */
  get hue(): number {
    return this.style.hue;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get crackAlive(): boolean {
    return this.crackOn;
  }

  /** 光标跟随：居中绘制在 (x, y)，保持宽高比。 */
  drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.ready) return;
    ctx.drawImage(this.img, x - this.fitW / 2, y - this.fitH / 2, this.fitW, this.fitH);
  }

  /** 触发该素材的专属爆裂动画。 */
  startCrack(x: number, y: number, vel: WhipVel = DEFAULT_VEL): void {
    this.crackOn = true;
    this.crackT0 = performance.now();
    this.crackX = x;
    this.crackY = y;
    this.crackVel = vel;
    this.particles = this.style.emit(x, y, vel);
  }

  /**
   * 推进并绘制爆裂动画。动画结束时把 crackOn 置为 false，
   * 调用方据此判断是否隐藏覆盖层。
   */
  updateAndDrawCrack(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.crackOn) return;
    const t = (now - this.crackT0) / CRACK_MS;
    if (t >= 1) {
      this.crackOn = false;
      this.particles = [];
      return;
    }

    const cx = this.crackX;
    const cy = this.crackY;

    // 粒子：物理推进 + 按 shape 批量绘制 + 原地压缩。
    // 按 shape 分组绘制，减少 ctx.save/restore 和 style 切换次数。
    let write = 0;
    const ps = this.particles;

    // Phase 1: 物理推进，收集活粒子，标记形状
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= p.decay;
      if (p.life <= 0) continue;
      if (write !== i) ps[write] = p;
      write++;
    }
    ps.length = write;

    // Phase 2: 按 shape 批量绘制（最小化 ctx 状态切换 + 预计算颜色缓存）
    ctx.save();

    // Dot 批次：合并所有 dot 到单一 path，一次 fill（消除逐粒子 fill 调用）
    ctx.beginPath();
    for (let i = 0; i < write; i++) {
      const p = ps[i];
      if (p.shape !== 0) continue; // 0 = dot
      const sz = p.size * p.life;
      ctx.moveTo(p.x + sz, p.y);
      ctx.arc(p.x, p.y, sz, 0, TAU);
    }
    ctx.fillStyle = HSL_DOT_CACHE[0];
    ctx.globalAlpha = 1;
    ctx.fill();

    // Streak 批次：同色合并路径
    ctx.lineCap = 'round';
    let lastHue = -1;
    ctx.beginPath();
    for (let i = 0; i < write; i++) {
      const p = ps[i];
      if (p.shape !== 1) continue; // 1 = streak
      const hue = p.hue;
      if (hue !== lastHue) {
        if (lastHue >= 0) {
          ctx.strokeStyle = HSL_STREAK_CACHE[lastHue];
          ctx.stroke();
          ctx.beginPath();
        }
        lastHue = hue;
      }
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      ctx.lineWidth = p.size * p.life;
      const len = 10 + p.life * 14;
      const a = Math.atan2(p.vy, p.vx);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
    }
    if (lastHue >= 0) {
      ctx.strokeStyle = HSL_STREAK_CACHE[lastHue];
      ctx.stroke();
    }

    // Shard 批次：同色合并路径
    ctx.beginPath();
    lastHue = -1;
    for (let i = 0; i < write; i++) {
      const p = ps[i];
      if (p.shape !== 2) continue; // 2 = shard
      const hue = p.hue;
      if (hue !== lastHue) {
        if (lastHue >= 0) {
          ctx.fillStyle = HSL_SHARD_CACHE[lastHue];
          ctx.fill();
          ctx.beginPath();
        }
        lastHue = hue;
      }
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      const sz = p.size * p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + now * 0.01);
      ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
      ctx.restore();
    }
    if (lastHue >= 0) {
      ctx.fillStyle = HSL_SHARD_CACHE[lastHue];
      ctx.fill();
    }

    ctx.restore();

    // 冲击增强层：光环 + 中心闪光（Task 5）
    drawImpact(ctx, now, cx, cy, this.crackVel, t);

    // 素材精灵：按专属运动轨迹位移 / 缩放 / 旋转 / 淡出。
    if (this.ready) {
      const s = this.style.sprite(t, this.crackVel);
      const iw = this.fitW * s.scale;
      const ih = this.fitH * s.scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.translate(cx + s.dx, cy + s.dy);
      if (s.rot) ctx.rotate(s.rot);
      ctx.drawImage(this.img, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    }
  }
}

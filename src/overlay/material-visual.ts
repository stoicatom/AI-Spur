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

const TAU = Math.PI * 2;
const CURSOR_MAX_PX = 56; // 光标精灵最长边（48–64 区间）
const CRACK_MS = 1200; // 爆裂动画时长

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

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

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
  shape: 'dot' | 'streak' | 'shard';
  angle: number;
}

/** 每枚素材的爆裂「风味」：主色相 + 精灵运动方式 + 粒子发射器。 */
interface CrackStyle {
  /** 拖尾/粒子主色相。 */
  hue: number;
  /** 精灵在爆裂时如何运动（相对起点的位移 + 缩放 + 旋转，t∈[0,1]）。 */
  sprite: (t: number) => { dx: number; dy: number; scale: number; rot: number; alpha: number };
  /** 生成一批粒子。 */
  emit: (cx: number, cy: number) => Particle[];
}

function ring(cx: number, cy: number, count: number, speedLo: number, speedHi: number, hue: () => number, shape: Particle['shape'], gravity = 0.05): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rand(-0.15, 0.15);
    const speed = rand(speedLo, speedHi);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, decay: rand(0.018, 0.03), size: rand(2, 4.5),
      hue: hue(), gravity, shape, angle,
    });
  }
  return out;
}

/** 素材 id → 专属爆裂风味。未知 id 回退到通用锻造橙爆裂。 */
function crackStyle(id: string): CrackStyle {
  switch (id) {
    // ── whip · 三态变速弧（大范围）────────────────────────────────────
    case 'whip':
      return {
        hue: 28,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.25) {
            const s = t / 0.25;
            dx = Math.sin(s * 20) * 8 * (1 - s);
            dy = Math.cos(s * 24) * 6 * (1 - s);
            rot = Math.sin(s * 30) * 0.3;
          } else if (t < 0.75) {
            const s = (t - 0.25) / 0.5;
            const angle = -Math.PI * 0.1 + s * Math.PI * 0.6;
            const r = 40 + s * s * 120;
            dx = Math.cos(angle) * r;
            dy = -Math.sin(angle) * r;
            scale = 1 + s * 1.8;
            rot = -angle + Math.PI * 0.5;
          } else {
            const s = (t - 0.75) / 0.25;
            const angle = Math.PI * 0.5;
            const r = 160 + s * 40;
            dx = Math.cos(angle) * r;
            dy = -Math.sin(angle) * r;
            scale = 2.8 - s * 0.6;
            rot = Math.PI * 0.4 - s * 0.3;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 50; i++) {
            const frac = i / 50;
            const angle = -Math.PI * 0.1 + frac * Math.PI * 0.6;
            const r = 40 + frac * frac * 120;
            const px = cx + Math.cos(angle) * r;
            const py = cy - Math.sin(angle) * r;
            const tangent = angle + Math.PI * 0.5;
            const sp = rand(6, 14);
            out.push({ x: px, y: py, vx: Math.cos(tangent) * sp, vy: -Math.sin(tangent) * sp,
              life: 1, decay: rand(0.015, 0.025), size: rand(4, 9),
              hue: rand(22, 40), gravity: 0.05, shape: 'streak', angle: tangent });
          }
          for (let i = 0; i < 30; i++) {
            const a = rand(0, TAU);
            const sp = rand(2, 8);
            out.push({ x: cx + rand(30, 80), y: cy - rand(60, 120), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.035), size: rand(2.5, 5),
              hue: rand(14, 38), gravity: 0.1, shape: Math.random() < 0.5 ? 'shard' : 'dot', angle: rand(0, TAU) });
          }
          return out;
        },
      };
    // ── classic · 横扫亮痕（大范围）────────────────────────────────────
    case 'classic':
      return {
        hue: 200,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1.1, alpha = 1;
          if (t < 0.2) {
            alpha = t / 0.2 * 0.15;
            dx = t / 0.2 * (-120);
          } else if (t < 0.6) {
            const s = (t - 0.2) / 0.4;
            dx = -120 + s * 280;
            dy = 20 - s * 36;
            alpha = 0.15 + s * 0.85;
          } else {
            const s = (t - 0.6) / 0.4;
            dx = 160 + s * 20;
            dy = -16 + s * (-6);
            scale = 1.1 + (s < 0.3 ? s / 0.3 * 1.0 : (1 - (s - 0.3) / 0.7) * 1.0);
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot: 0, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 40; i++) {
            const frac = (i / 40 - 0.5) * 200;
            const px = cx + frac;
            const py = cy + frac * (-0.15);
            const sp = rand(8, 18);
            out.push({ x: px, y: py, vx: sp, vy: rand(-0.6, 0.6),
              life: 1, decay: rand(0.018, 0.03), size: rand(3.5, 8),
              hue: rand(195, 215), gravity: 0.02, shape: 'streak', angle: 0.05 });
          }
          for (let i = 0; i < 15; i++) {
            const a = Math.PI + rand(-0.5, 0.5);
            const sp = rand(2, 7);
            out.push({ x: cx - 110 + rand(-8, 8), y: cy + 16 + rand(-6, 6),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.5,
              life: 1, decay: rand(0.022, 0.038), size: rand(2.5, 5),
              hue: rand(210, 230), gravity: 0.08, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    // ── rocket · 点火喷射（大范围）─────────────────────────────────────
    case 'rocket':
      return {
        hue: 26,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            const s = t / 0.2;
            dx = Math.sin(s * 40) * 6;
            dy = s * 12;
            scale = 1 + Math.sin(s * 20) * 0.3;
            rot = Math.sin(s * 30) * 0.25;
          } else if (t < 0.75) {
            const s = (t - 0.2) / 0.55;
            dy = 12 - s * s * s * 760;
            scale = 1 + s * 0.5;
            rot *= 1 - s;
          } else {
            const s = (t - 0.75) / 0.25;
            dy = 12 - 760 - s * 120;
            scale = 1.5 + s * 0.2;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 60; i++) {
            const sp = rand(12, 28);
            const a = Math.PI / 2 + rand(-0.3, 0.3);
            out.push({ x: cx + rand(-6, 6), y: cy + 10,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.012, 0.02), size: rand(5, 12),
              hue: rand(18, 36), gravity: 0, shape: 'streak', angle: a });
          }
          for (let i = 0; i < 40; i++) {
            const a = Math.PI / 2 + rand(-1.2, 1.2);
            const sp = rand(3, 10);
            out.push({ x: cx + rand(-18, 18), y: cy + rand(12, 40),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.015, 0.03), size: rand(3.5, 8),
              hue: rand(14, 40), gravity: -0.01, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    // ── lightning · 闪烁劈裂（大范围）──────────────────────────────────
    case 'lightning':
      return {
        hue: 205,
        sprite: (t) => {
          const alpha = Math.max(0, 1 - t) * (0.55 + 0.45 * Math.sin(t * 50));
          const scale = t < 0.2 ? 2.0 - t * 4 : 1.2 + (t - 0.2) * 0.8;
          return { dx: 0, dy: 0, scale, rot: 0, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          const arcs = 4 + Math.floor(Math.random() * 4);
          for (let a = 0; a < arcs; a++) {
            const baseAngle = (a / arcs) * TAU + rand(-0.3, 0.3);
            const arcLen = rand(80, 160);
            const segs = 3 + Math.floor(Math.random() * 3);
            const delay = rand(0, 0.15);
            for (let s = 0; s < segs; s++) {
              const segAngle = baseAngle + (Math.random() - 0.5) * 1.2;
              const sx = cx + Math.cos(baseAngle) * arcLen * (s / segs);
              const sy = cy + Math.sin(baseAngle) * arcLen * (s / segs);
              const sp = rand(10, 20);
              out.push({ x: sx, y: sy,
                vx: Math.cos(segAngle) * sp, vy: Math.sin(segAngle) * sp,
                life: 1, decay: rand(0.022, 0.038) + delay, size: rand(4.5, 10),
                hue: rand(195, 210), gravity: 0, shape: 'streak', angle: segAngle });
              if (Math.random() < 0.6) {
                const branchAngle = segAngle + (Math.random() > 0.5 ? 1 : -1) * rand(0.6, 1.2);
                const bs = rand(6, 14);
                out.push({ x: sx, y: sy,
                  vx: Math.cos(branchAngle) * bs, vy: Math.sin(branchAngle) * bs,
                  life: 1, decay: rand(0.028, 0.045) + delay, size: rand(3, 6),
                  hue: rand(210, 225), gravity: 0, shape: 'streak', angle: branchAngle });
              }
            }
          }
          return out;
        },
      };
    // ── flame · 舒展上腾（大范围）──────────────────────────────────────
    case 'flame':
      return {
        hue: 20,
        sprite: (t) => {
          const dx = 44 * Math.sin(t * 10) * Math.exp(-3 * t);
          const dy = -t * 60;
          const scale = 0.4 + t * 3.0;
          const rot = Math.sin(t * 8) * 0.24;
          const alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) * 0.8 / 0.9;
          return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 60; i++) {
            const base = rand(-20, 20);
            const sp = rand(4, 10);
            const vx = base * 0.3 + Math.sin(i * 0.7) * 3;
            const vy = -sp;
            const frac = i / 60;
            const hue = 14 + frac * 36;
            out.push({ x: cx + rand(-14, 14), y: cy + rand(-6, 12),
              vx, vy, life: 1, decay: rand(0.008, 0.018),
              size: rand(3.5, 8), hue, gravity: -0.03, shape: 'dot', angle: 0 });
          }
          for (let i = 0; i < 20; i++) {
            const a = rand(-1.2, 1.2);
            const sp = rand(2, 6);
            out.push({ x: cx + rand(-16, 16), y: cy - rand(16, 35),
              vx: Math.cos(a) * sp, vy: -0.5,
              life: 1, decay: rand(0.012, 0.022), size: rand(3, 6),
              hue: rand(0, 10), gravity: 0.06, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    // ── star · 五芒绽放（大范围）───────────────────────────────────────
    case 'star':
      return {
        hue: 45,
        sprite: (t) => {
          const scale = t < 0.3 ? 1 + t / 0.3 * 2.0 : 3.0 - (t - 0.3) / 0.7 * 2.0;
          const wobble = t < 0.3 ? Math.sin(t * 60) * 0.16 : 0;
          return { dx: 0, dy: 0, scale, rot: t * Math.PI + wobble, alpha: 1 - t * t };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let arm = 0; arm < 5; arm++) {
            const baseAngle = (arm / 5) * TAU - Math.PI / 2;
            for (let j = 0; j < 10; j++) {
              const a = baseAngle + rand(-0.12, 0.12);
              const sp = rand(6, 20);
              out.push({ x: cx, y: cy,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 1, decay: rand(0.018, 0.03), size: rand(3, 7),
                hue: rand(40, 56), gravity: 0.02, shape: 'dot', angle: 0 });
            }
          }
          return out;
        },
      };
    // ── meteor · 弧线俯冲撞击（大范围）────────────────────────────────
    case 'meteor':
      return {
        hue: 30,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = t * 6, alpha = 1;
          if (t < 0.8) {
            const s = t / 0.8;
            dx = s * 240;
            dy = -s * (1 - s) * 320;
            scale = 1 - s * 0.15;
          } else {
            const s = (t - 0.8) / 0.2;
            dx = 240 + s * 20;
            dy = -s * (1 - s) * 320;
            scale = 0.85 + s * 2.7;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 40; i++) {
            const frac = i / 40;
            const px = cx + frac * 100;
            const py = cy - frac * 60 + frac * frac * 40;
            const a = Math.PI * 0.8 + rand(-0.3, 0.3);
            const sp = rand(4, 10);
            out.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(3.5, 7),
              hue: rand(20, 38), gravity: 0.12, shape: 'streak', angle: a });
          }
          for (let i = 0; i < 20; i++) {
            const a = rand(-Math.PI * 0.8, Math.PI * 0.2);
            const sp = rand(10, 24);
            out.push({ x: cx + 260, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(4.5, 10),
              hue: rand(22, 42), gravity: 0.08, shape: 'streak', angle: a });
          }
          for (let i = 0; i < 10; i++) {
            const a = rand(-1.2, 0.2);
            const sp = rand(8, 20);
            out.push({ x: cx + 260, y: cy - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(5, 12),
              hue: rand(15, 35), gravity: 0.2, shape: 'shard', angle: rand(0, TAU) });
          }
          return out;
        },
      };
    // ── skull · 结构崩解（大范围）──────────────────────────────────────
    case 'skull':
      return {
        hue: 8,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
          } else if (t < 0.35) {
            const s = (t - 0.2) / 0.15;
            dx = Math.sin(s * 50) * 16 * s;
            rot = Math.sin(s * 40) * 0.3 * s;
            scale = 1 + Math.sin(s * 30) * 0.1;
          } else if (t < 0.5) {
            const s = (t - 0.35) / 0.15;
            dx = Math.sin(t * 60) * 20 * (1 - s);
            scale = 1 - s * 0.4;
            alpha = 1 - s * 0.3;
          } else {
            const s = (t - 0.5) / 0.5;
            alpha = 0.7 - s * 0.7;
          }
          return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 40; i++) {
            const isTop = Math.random() < 0.45;
            const ox = rand(-32, 32);
            const oy = isTop ? rand(-40, -16) : rand(16, 36);
            const vx = ox * 0.3 + rand(-2, 2);
            const vy = isTop ? rand(-4, 2) : rand(2, 6);
            out.push({ x: cx + ox, y: cy + oy, vx, vy,
              life: 1, decay: rand(0.018, 0.035), size: rand(4.5, 10),
              hue: rand(10, 24), gravity: 0.2, shape: 'shard', angle: rand(0, TAU) });
          }
          for (let i = 0; i < 25; i++) {
            const a = rand(0, TAU);
            const sp = rand(2, 6);
            out.push({ x: cx + rand(-28, 28), y: cy + rand(-20, 20),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5,
              life: 1, decay: rand(0.012, 0.025), size: rand(2, 5),
              hue: rand(0, 12), gravity: 0.08, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    // ── crown · 上抛自旋加冕（大范围）──────────────────────────────────
    case 'crown':
      return {
        hue: 45,
        sprite: (t) => {
          const dy = -4 * 140 * t * (1 - t);
          let rot = 0;
          if (t < 0.4) rot = (t / 0.4) * 0.7 * TAU;
          else rot = 0.7 * TAU + ((t - 0.4) / 0.6) * 0.3 * TAU;
          const scale = 0.9 + t * 0.8;
          const alpha = t > 0.9 ? 1 - (t - 0.9) / 0.1 : 1;
          return { dx: 0, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * TAU;
            const r = 36 + rand(-8, 8);
            out.push({ x: cx + Math.cos(angle) * r, y: cy - 140 + Math.sin(angle) * r,
              vx: Math.cos(angle) * 0.6, vy: Math.sin(angle) * 0.6,
              life: 1, decay: rand(0.01, 0.018), size: rand(4, 8),
              hue: i % 2 === 0 ? rand(40, 52) : rand(195, 215), gravity: -0.03, shape: 'dot', angle: 0 });
          }
          for (let i = 0; i < 28; i++) {
            const frac = i / 28;
            const py = cy - frac * 140;
            const a = -Math.PI / 2 + rand(-0.15, 0.15);
            const sp = rand(4, 10);
            out.push({ x: cx + rand(-6, 6), y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.015, 0.025), size: rand(2.5, 5),
              hue: rand(40, 56), gravity: -0.01, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    // ── sword · 两段式挥斩（大范围）────────────────────────────────────
    case 'sword':
      return {
        hue: 24,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.35) {
            const s = t / 0.35;
            dx = -s * 50;
            dy = -s * 90;
            rot = -s * 1.6;
            scale = 0.95 + s * 0.1;
          } else if (t < 0.75) {
            const s = (t - 0.35) / 0.4;
            const angle = -Math.PI * 0.3 + s * Math.PI * 0.7;
            const r = 110;
            dx = -50 + Math.cos(angle + Math.PI * 0.5) * r * s;
            dy = -90 + Math.sin(angle + Math.PI * 0.5) * r * s + 170 * s;
            rot = -1.6 + s * 3.2;
            scale = 1 + s * 0.8;
            alpha = 1;
          } else {
            const s = (t - 0.75) / 0.25;
            dy = 80 - s * 80;
            rot = 1.6 - s * 1.6;
            scale = 1.8 - s * 0.6;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 40; i++) {
            const frac = i / 40;
            const angle = -Math.PI * 0.3 + frac * Math.PI * 0.7;
            const r = 110;
            const px = cx - 50 + Math.cos(angle + Math.PI * 0.5) * r * frac;
            const py = cy - 90 + Math.sin(angle + Math.PI * 0.5) * r * frac + 170 * frac;
            const tangent = angle + Math.PI * 0.5;
            const sp = rand(10, 22);
            out.push({ x: px, y: py,
              vx: Math.cos(tangent) * sp, vy: Math.sin(tangent) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(4.5, 10),
              hue: rand(40, 56), gravity: 0.03, shape: 'streak', angle: tangent });
          }
          for (let i = 0; i < 20; i++) {
            const a = rand(-1.6, 0.8) + Math.PI * 0.4;
            const sp = rand(6, 16);
            out.push({ x: cx + 60, y: cy + 80, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.035), size: rand(3, 7),
              hue: rand(20, 46), gravity: 0.12, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    default:
      // 通用锻造橙爆裂（自定义素材）。
      return {
        hue: 24,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 1.4, rot: 0, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 28, 3, 10, () => rand(16, 40), 'dot', 0.06),
      };
  }
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
  startCrack(x: number, y: number): void {
    this.crackOn = true;
    this.crackT0 = performance.now();
    this.crackX = x;
    this.crackY = y;
    this.particles = this.style.emit(x, y);
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

    // 粒子：物理推进 + 绘制 + 「原地压缩」在单遍内完成。活粒子写入数组前段，
    // 最后截断 length——不再每帧 `filter` 分配新数组（爆裂期间 720ms 内的
    // 主要 GC 压力来源）。
    let write = 0;
    const ps = this.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= p.decay;
      if (p.life <= 0) continue; // 死粒子：不画也不压实（后面统一截断）。

      // 绘制活粒子。
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      const sz = p.size * p.life;
      if (p.shape === 'dot') {
        ctx.fillStyle = `hsl(${p.hue}, 100%, 62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'streak') {
        ctx.strokeStyle = `hsl(${p.hue}, 100%, 66%)`;
        ctx.lineWidth = sz;
        ctx.lineCap = 'round';
        const len = 10 + p.life * 14;
        const a = Math.atan2(p.vy, p.vx);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        ctx.stroke();
      } else {
        // shard：小方片
        ctx.fillStyle = `hsl(${p.hue}, 90%, 58%)`;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle + now * 0.01);
        ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
      }
      ctx.restore();

      // 压实：活粒子留在前段（原位或前移覆盖死粒子）。
      if (write !== i) ps[write] = p;
      write++;
    }
    ps.length = write;

    // 素材精灵：按专属运动轨迹位移 / 缩放 / 旋转 / 淡出。
    if (this.ready) {
      const s = this.style.sprite(t);
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

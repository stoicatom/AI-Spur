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
const CRACK_MS = 800; // 爆裂动画时长
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
  shape: 0 | 1 | 2;
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
    // ── whip · 甩鞭：蓄力→弧线甩出→鞭梢爆破 ──────────────────────────
    case 'whip':
      return {
        hue: 28,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 蓄力：微颤+蓄势后缩
            const s = t / 0.15;
            dx = Math.sin(s * 24) * 6;
            dy = s * 8;
            scale = 1 - s * 0.12;
            rot = Math.sin(s * 18) * 0.12;
          } else if (t < 0.5) {
            // 甩出：沿弧线加速扫过
            const s = (t - 0.15) / 0.35;
            const angle = s * Math.PI * 0.55;
            const r = s * s * 260;
            dx = Math.cos(angle) * r;
            dy = -Math.sin(angle) * r;
            scale = 0.88 + s * 1.5;
            rot = -angle + Math.PI * 0.4;
          } else if (t < 0.7) {
            // 鞭梢过冲：继续前冲但减速
            const s = (t - 0.5) / 0.2;
            const r = 260 + s * 80;
            dx = Math.cos(Math.PI * 0.55) * r;
            dy = -Math.sin(Math.PI * 0.55) * r;
            scale = 2.38 + s * 0.4;
            rot = Math.PI * 0.4 - s * 0.2;
            alpha = 1;
          } else {
            // 回弹+淡出
            const s = (t - 0.7) / 0.3;
            const r = 340 - s * 40;
            dx = Math.cos(Math.PI * 0.55) * r;
            dy = -Math.sin(Math.PI * 0.55) * r - s * 30;
            scale = 2.78 - s * 1.0;
            rot = Math.PI * 0.36 - s * 0.5;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：弧线残影（鞭身扫过的路径）
          for (let i = 0; i < 55; i++) {
            const frac = i / 55;
            const angle = frac * Math.PI * 0.55;
            const r = frac * frac * 260;
            const px = cx + Math.cos(angle) * r;
            const py = cy - Math.sin(angle) * r;
            const tangent = angle + Math.PI * 0.5;
            const sp = rand(5, 12);
            out.push({ x: px, y: py, vx: Math.cos(tangent) * sp, vy: -Math.sin(tangent) * sp,
              life: 1, decay: rand(0.012, 0.02), size: rand(3, 8),
              hue: rand(20, 42), gravity: 0.04, shape: 1, angle: tangent });
          }
          // 第二层：鞭梢爆破火花（末端散射）
          for (let i = 0; i < 25; i++) {
            const a = rand(-0.8, 0.8) + Math.PI * 0.55;
            const sp = rand(4, 14);
            out.push({ x: cx + 180, y: cy - 200, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(3, 7),
              hue: rand(35, 55), gravity: 0.08, shape: 0, angle: 0 });
          }
          // 第三层：皮革碎片散落
          for (let i = 0; i < 18; i++) {
            const a = rand(0, TAU);
            const sp = rand(2, 7);
            out.push({ x: cx + rand(60, 200), y: cy - rand(80, 220), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(2, 5),
              hue: rand(12, 35), gravity: 0.12, shape: Math.random() < 0.4 ? 2 : 0, angle: rand(0, TAU) });
          }
          return out;
        },
      };
    // ── classic · 横切光弧：蓄势→横扫→光芒收敛 ────────────────────────
    case 'classic':
      return {
        hue: 200,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, alpha = 1;
          if (t < 0.1) {
            // 蓄势：压缩+闪烁
            alpha = 0.3 + Math.sin(t * 80) * 0.2;
            scale = 0.85;
          } else if (t < 0.45) {
            // 加速横扫
            const s = (t - 0.1) / 0.35;
            dx = s * 220;
            dy = s * (-20);
            scale = 0.85 + s * 0.8;
            alpha = 0.5 + s * 0.5;
          } else if (t < 0.65) {
            // 满速：光痕最亮最大
            const s = (t - 0.45) / 0.2;
            dx = 220 + s * 30;
            dy = -20 + s * (-5);
            scale = 1.65 + Math.sin(s * 12) * 0.15;
          } else {
            // 光芒收敛淡出
            const s = (t - 0.65) / 0.35;
            dx = 250 + s * 10;
            dy = -25 - s * 8;
            scale = 1.8 - s * 0.6;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot: 0, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：主光痕 streak（水平飞射）
          for (let i = 0; i < 45; i++) {
            const frac = (i / 45 - 0.5) * 240;
            const px = cx + frac;
            const py = cy + frac * (-0.09);
            const sp = rand(8, 20);
            out.push({ x: px, y: py, vx: sp, vy: rand(-0.5, 0.5),
              life: 1, decay: rand(0.015, 0.025), size: rand(4, 10),
              hue: rand(192, 215), gravity: 0.01, shape: 1, angle: 0.04 });
          }
          // 第二层：起点爆散光点
          for (let i = 0; i < 15; i++) {
            const a = rand(Math.PI * 0.4, Math.PI * 0.8);
            const sp = rand(2, 6);
            out.push({ x: cx + rand(-5, 5), y: cy + rand(-5, 5),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.025, 0.04), size: rand(2, 4),
              hue: rand(210, 235), gravity: 0.05, shape: 0, angle: 0 });
          }
          // 第三层：终点灰烟
          for (let i = 0; i < 12; i++) {
            const a = Math.PI + rand(-0.6, 0.6);
            const sp = rand(1.5, 4);
            out.push({ x: cx - 115 + rand(-6, 6), y: cy + 10 + rand(-4, 4),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.3,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
              hue: rand(215, 235), gravity: 0.08, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── rocket · 多段火箭升空：点火→加速→穿云→尾焰消散 ────────────────
    case 'rocket':
      return {
        hue: 26,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.12) {
            // 点火：震颤+火焰膨胀
            const s = t / 0.12;
            dx = Math.sin(s * 50) * 5;
            dy = s * 10;
            scale = 1 + Math.sin(s * 30) * 0.2;
            rot = Math.sin(s * 35) * 0.15;
          } else if (t < 0.15) {
            // 起飞瞬间
            const s = (t - 0.12) / 0.03;
            dy = 10 - s * 40;
            scale = 1.2 + s * 0.3;
          } else if (t < 0.65) {
            // 主加速段：三次方加速
            const s = (t - 0.15) / 0.5;
            dy = -30 - s * s * s * 600;
            scale = 1.5 + s * 0.5;
            rot *= (1 - s);
          } else if (t < 0.85) {
            // 穿云段：速度放缓
            const s = (t - 0.65) / 0.2;
            dy = -30 - 600 - s * 80;
            scale = 2.0 + s * 0.3;
          } else {
            // 淡出
            const s = (t - 0.85) / 0.15;
            dy = -30 - 680 - s * 60;
            scale = 2.3 + s * 0.2;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：核心白热喷流（高速向下 streak）
          for (let i = 0; i < 30; i++) {
            const sp = rand(14, 30);
            const a = Math.PI / 2 + rand(-0.2, 0.2);
            out.push({ x: cx + rand(-4, 4), y: cy + 8,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.01, 0.018), size: rand(6, 14),
              hue: rand(40, 60), gravity: 0, shape: 1, angle: a });
          }
          // 第二层：橙红外层火焰
          for (let i = 0; i < 35; i++) {
            const a = Math.PI / 2 + rand(-0.6, 0.6);
            const sp = rand(6, 16);
            out.push({ x: cx + rand(-12, 12), y: cy + rand(10, 30),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.012, 0.022), size: rand(4, 10),
              hue: rand(14, 32), gravity: 0, shape: 0, angle: 0 });
          }
          // 第三层：烟雾羽流（负重力飘浮）
          for (let i = 0; i < 25; i++) {
            const a = Math.PI / 2 + rand(-1.0, 1.0);
            const sp = rand(3, 8);
            out.push({ x: cx + rand(-20, 20), y: cy + rand(15, 45),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.015, 0.028), size: rand(3, 7),
              hue: rand(10, 25), gravity: -0.02, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── lightning · 电弧劈裂：蓄电→多段闪烁→分叉→余电消散 ────────────
    case 'lightning':
      return {
        hue: 205,
        sprite: (t) => {
          // 高频闪烁：开头连闪2-3次，后段渐灭
          const flicker = t < 0.35
            ? (0.5 + 0.5 * Math.abs(Math.sin(t * 55))) // 前段剧烈闪烁
            : (1 - (t - 0.35) / 0.65);                   // 后段渐灭
          const alpha = Math.max(0, flicker);
          const scale = t < 0.1
            ? 1.0 + Math.sin(t * 80) * 0.6 // 爆闪
            : t < 0.4
              ? 1.6 - (t - 0.1) / 0.3 * 0.6
              : 1.0 - (t - 0.4) * 0.5;
          return { dx: 0, dy: 0, scale: Math.max(0.3, scale), rot: 0, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：主电弧（粗大分形折线）
          const mainArcs = 3 + Math.floor(Math.random() * 3);
          for (let a = 0; a < mainArcs; a++) {
            const baseAngle = (a / mainArcs) * TAU + rand(-0.4, 0.4);
            const arcLen = rand(100, 200);
            const segs = 4 + Math.floor(Math.random() * 3);
            const delay = rand(0, 0.2);
            for (let s = 0; s < segs; s++) {
              const segAngle = baseAngle + (Math.random() - 0.5) * 1.5;
              const progress = (s + 1) / segs;
              const sx = cx + Math.cos(baseAngle) * arcLen * progress;
              const sy = cy + Math.sin(baseAngle) * arcLen * progress;
              const sp = rand(12, 25);
              out.push({ x: sx, y: sy,
                vx: Math.cos(segAngle) * sp, vy: Math.sin(segAngle) * sp,
                life: 1, decay: rand(0.02, 0.035) + delay, size: rand(5, 12),
                hue: rand(195, 215), gravity: 0, shape: 1, angle: segAngle });
            }
          }
          // 第二层：次级分叉（短而亮）
          for (let i = 0; i < 15; i++) {
            const a = rand(0, TAU);
            const sp = rand(8, 16);
            out.push({ x: cx + rand(-40, 40), y: cy + rand(-40, 40),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.025, 0.04), size: rand(2.5, 5),
              hue: rand(200, 230), gravity: 0, shape: 1, angle: a });
          }
          // 第三层：电弧余辉光点
          for (let i = 0; i < 20; i++) {
            const a = rand(0, TAU);
            const sp = rand(3, 10);
            out.push({ x: cx + rand(-60, 60), y: cy + rand(-60, 60),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.03, 0.05), size: rand(2, 4),
              hue: rand(190, 220), gravity: 0, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── flame · 烈焰腾升：点火→爆燃→火舌摇曳→余烬 ───────────────────
    case 'flame':
      return {
        hue: 20,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.08) {
            // 点火：从小火星爆发
            const s = t / 0.08;
            scale = 0.2 + s * 0.6;
            alpha = s;
          } else if (t < 0.35) {
            // 爆燃膨胀
            const s = (t - 0.08) / 0.27;
            dx = Math.sin(s * 12) * 18;
            dy = -s * 40;
            scale = 0.8 + s * 1.8;
            rot = Math.sin(s * 8) * 0.2;
          } else if (t < 0.7) {
            // 火舌摇曳：呼吸摆动+上腾
            const s = (t - 0.35) / 0.35;
            dx = Math.sin(t * 14) * 20 * (1 - s * 0.5);
            dy = -40 - s * 50;
            scale = 2.6 + Math.sin(t * 10) * 0.3;
            rot = Math.sin(t * 9) * 0.15;
          } else {
            // 余烬淡出
            const s = (t - 0.7) / 0.3;
            dy = -90 - s * 30;
            scale = 2.6 - s * 1.2;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：核心白热火星（高速上冲）
          for (let i = 0; i < 35; i++) {
            const base = rand(-10, 10);
            const sp = rand(6, 14);
            const vx = base * 0.4 + Math.sin(i * 0.5) * 2;
            out.push({ x: cx + rand(-6, 6), y: cy + rand(-4, 4),
              vx, vy: -sp, life: 1, decay: rand(0.008, 0.015),
              size: rand(5, 11), hue: rand(38, 55), gravity: -0.04, shape: 0, angle: 0 });
          }
          // 第二层：橙红外焰（涡旋上升）
          for (let i = 0; i < 40; i++) {
            const base = rand(-18, 18);
            const sp = rand(3, 8);
            const vx = base * 0.3 + Math.sin(i * 0.4) * 3;
            const frac = i / 40;
            const hue = 14 + frac * 28;
            out.push({ x: cx + rand(-14, 14), y: cy + rand(-2, 8),
              vx, vy: -sp, life: 1, decay: rand(0.01, 0.02),
              size: rand(3.5, 8), hue, gravity: -0.03, shape: 0, angle: 0 });
          }
          // 第三层：烟雾（横向扩散+下沉）
          for (let i = 0; i < 18; i++) {
            const a = rand(-1.4, 1.4);
            const sp = rand(2, 5);
            out.push({ x: cx + rand(-14, 14), y: cy - rand(14, 30),
              vx: Math.cos(a) * sp, vy: -0.3,
              life: 1, decay: rand(0.012, 0.02), size: rand(3, 6),
              hue: rand(0, 8), gravity: 0.07, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── star · 五芒星绽放：凝聚→爆发→五芒光丝→星尘散落 ───────────────
    case 'star':
      return {
        hue: 45,
        sprite: (t) => {
          let scale = 1, rot = 0, alpha = 1;
          if (t < 0.12) {
            // 凝聚：缩到最小
            scale = 1 - t / 0.12 * 0.3;
          } else if (t < 0.35) {
            // 爆发绽放
            const s = (t - 0.12) / 0.23;
            scale = 0.7 + s * 2.3;
            rot = s * Math.PI * 0.5;
          } else if (t < 0.7) {
            // 五芒旋转+脉动
            const s = (t - 0.35) / 0.35;
            scale = 3.0 + Math.sin(s * 18) * 0.2;
            rot = Math.PI * 0.5 + s * Math.PI * 0.5;
          } else {
            // 缩小淡出
            const s = (t - 0.7) / 0.3;
            scale = 3.0 - s * 2.0;
            rot = Math.PI + s * Math.PI * 0.3;
            alpha = 1 - s * s;
          }
          return { dx: 0, dy: 0, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：五芒光丝（5×8粒子）
          for (let arm = 0; arm < 5; arm++) {
            const baseAngle = (arm / 5) * TAU - Math.PI / 2;
            for (let j = 0; j < 8; j++) {
              const a = baseAngle + rand(-0.08, 0.08);
              const sp = rand(8, 22);
              out.push({ x: cx, y: cy,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 1, decay: rand(0.015, 0.028), size: rand(4, 9),
                hue: rand(38, 58), gravity: 0.01, shape: 0, angle: 0 });
            }
          }
          // 第二层：五芒间填充光点（5个间隙方向）
          for (let i = 0; i < 10; i++) {
            const baseAngle = (i / 10 + 0.5 / 5) * TAU - Math.PI / 2;
            const a = baseAngle + rand(-0.2, 0.2);
            const sp = rand(5, 15);
            out.push({ x: cx, y: cy,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
              hue: rand(50, 65), gravity: 0.02, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── meteor · 流星坠击：弧线飞行→翻滚→撞击爆裂→尘埃散落 ───────────
    case 'meteor':
      return {
        hue: 30,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.1) {
            // 远处出现
            scale = 0.5 + t / 0.1 * 0.5;
            dx = -t / 0.1 * 40;
          } else if (t < 0.75) {
            // 弧线飞行：抛物线轨迹
            const s = (t - 0.1) / 0.65;
            dx = -40 + s * 340;
            dy = -s * (1 - s) * 350;
            rot = s * 8;
            scale = 1.0 + s * 0.3;
          } else if (t < 0.82) {
            // 撞击瞬间：急速放大
            const s = (t - 0.75) / 0.07;
            dx = 300 + s * 20;
            scale = 1.3 + s * 2.5;
            alpha = 1;
          } else {
            // 消散
            const s = (t - 0.82) / 0.18;
            dx = 320;
            scale = 3.8 - s * 2.5;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：飞行火尾（沿抛物线身后撒 streak）
          for (let i = 0; i < 35; i++) {
            const frac = i / 35;
            const px = cx - 40 + frac * 150;
            const py = cy - frac * 80 + frac * frac * 60;
            const a = Math.PI * 0.85 + rand(-0.25, 0.25);
            const sp = rand(3, 8);
            out.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.015, 0.025), size: rand(3.5, 8),
              hue: rand(18, 40), gravity: 0.1, shape: 1, angle: a });
          }
          // 第二层：撞击冲击波（扇形爆开）
          for (let i = 0; i < 25; i++) {
            const a = rand(-Math.PI * 0.9, Math.PI * 0.1);
            const sp = rand(8, 22);
            out.push({ x: cx + 320, y: cy + 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.015, 0.025), size: rand(4, 10),
              hue: rand(20, 45), gravity: 0.06, shape: 1, angle: a });
          }
          // 第三层：碎岩+火星
          for (let i = 0; i < 15; i++) {
            const a = rand(-1.4, 0.3);
            const sp = rand(6, 18);
            out.push({ x: cx + 320, y: cy + 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.015, 0.028), size: rand(4, 10),
              hue: rand(10, 35), gravity: 0.22, shape: 2, angle: rand(0, TAU) });
          }
          return out;
        },
      };
    // ── skull · 颅骨崩解：裂纹→碎裂→骨片坠落→灰烬飘散 ───────────────
    case 'skull':
      return {
        hue: 8,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.12) {
            // 预裂：微颤
            dx = Math.sin(t * 80) * 2;
            rot = Math.sin(t * 60) * 0.04;
          } else if (t < 0.28) {
            // 裂纹扩展：高频抖动加剧
            const s = (t - 0.12) / 0.16;
            dx = Math.sin(s * 60) * 14 * s;
            rot = Math.sin(s * 45) * 0.25 * s;
            scale = 1 + Math.sin(s * 35) * 0.08;
          } else if (t < 0.42) {
            // 碎开：左右分离+放大
            const s = (t - 0.28) / 0.14;
            dx = Math.sin(t * 50) * 18 * (1 - s);
            scale = 1.08 + s * 0.3;
            alpha = 1 - s * 0.2;
          } else if (t < 0.7) {
            // 崩散：快速缩放+下沉
            const s = (t - 0.42) / 0.28;
            scale = 1.38 - s * 0.8;
            alpha = 0.8 - s * 0.5;
          } else {
            // 消失
            const s = (t - 0.7) / 0.3;
            alpha = 0.3 - s * 0.3;
          }
          return { dx, dy, scale, rot, alpha: Math.max(0, alpha) };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：大骨片（从上下缘分离坠落）
          for (let i = 0; i < 30; i++) {
            const isTop = i < 12;
            const ox = rand(-30, 30);
            const oy = isTop ? rand(-45, -12) : rand(12, 40);
            const vx = ox * 0.25 + rand(-2, 2);
            const vy = isTop ? rand(-3, 1.5) : rand(1.5, 5);
            out.push({ x: cx + ox, y: cy + oy, vx, vy,
              life: 1, decay: rand(0.015, 0.03), size: rand(5, 11),
              hue: rand(8, 22), gravity: 0.25, shape: 2, angle: rand(0, TAU) });
          }
          // 第二层：小碎骨
          for (let i = 0; i < 20; i++) {
            const a = rand(0, TAU);
            const sp = rand(2, 8);
            out.push({ x: cx + rand(-25, 25), y: cy + rand(-20, 20),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.032), size: rand(2.5, 5),
              hue: rand(12, 28), gravity: 0.18, shape: 2, angle: rand(0, TAU) });
          }
          // 第三层：灰烬烟雾
          for (let i = 0; i < 18; i++) {
            const a = rand(-1.5, 1.5);
            const sp = rand(1, 4);
            out.push({ x: cx + rand(-20, 20), y: cy + rand(-12, 12),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.3,
              life: 1, decay: rand(0.012, 0.022), size: rand(2, 4.5),
              hue: rand(0, 10), gravity: 0.06, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── crown · 王冠加冕：抛起→旋转上升→宝石环绕→落回 ────────────────
    case 'crown':
      return {
        hue: 45,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.08) {
            // 预备：微缩
            scale = 1 - t / 0.08 * 0.1;
          } else if (t < 0.5) {
            // 上抛：抛物线上升
            const s = (t - 0.08) / 0.42;
            dy = -s * (1 - s) * 280;
            rot = s * 1.2 * TAU; // 快速旋转
            scale = 0.9 + s * 0.6;
          } else if (t < 0.7) {
            // 滞空：慢速旋转+宝石光晕
            const s = (t - 0.5) / 0.2;
            dy = -140 + Math.sin(s * Math.PI) * 15; // 微浮
            rot = 1.2 * TAU + s * 0.3 * TAU; // 变慢
            scale = 1.5 + Math.sin(s * 8) * 0.1; // 脉动
          } else {
            // 落回
            const s = (t - 0.7) / 0.3;
            dy = -140 + s * 140;
            rot = 1.5 * TAU + s * 0.5 * TAU;
            scale = 1.5 - s * 0.4;
            alpha = 1 - s * s * 0.5;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：宝石光晕环（在滞空高点）
          for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * TAU;
            const r = 30 + rand(-6, 6);
            out.push({ x: cx + Math.cos(angle) * r, y: cy - 140 + Math.sin(angle) * r,
              vx: Math.cos(angle) * 0.5, vy: Math.sin(angle) * 0.5,
              life: 1, decay: rand(0.008, 0.015), size: rand(4, 9),
              hue: i % 3 === 0 ? rand(195, 215) : i % 3 === 1 ? rand(0, 10) : rand(40, 55),
              gravity: -0.02, shape: 0, angle: 0 });
          }
          // 第二层：上抛弧光迹
          for (let i = 0; i < 25; i++) {
            const frac = i / 25;
            const py = cy - frac * 140;
            const a = -Math.PI / 2 + rand(-0.12, 0.12);
            const sp = rand(3, 8);
            out.push({ x: cx + rand(-5, 5), y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.012, 0.022), size: rand(2.5, 5),
              hue: rand(40, 58), gravity: -0.01, shape: 0, angle: 0 });
          }
          // 第三层：落点光晕
          for (let i = 0; i < 12; i++) {
            const a = rand(0, TAU);
            const sp = rand(2, 5);
            out.push({ x: cx + rand(-8, 8), y: cy + rand(-4, 4),
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
              hue: rand(35, 55), gravity: 0.04, shape: 0, angle: 0 });
          }
          return out;
        },
      };
    // ── sword · 三段式剑斩：提刀→劈下→收刀 ───────────────────────────
    case 'sword':
      return {
        hue: 24,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 提刀：后撤上举
            const s = t / 0.15;
            dx = -s * 40;
            dy = -s * 80;
            rot = -s * 1.2;
            scale = 0.9 + s * 0.1;
          } else if (t < 0.2) {
            // 蓄势停顿
            const s = (t - 0.15) / 0.05;
            dx = -40;
            dy = -80;
            rot = -1.2;
            scale = 1 + Math.sin(s * 20) * 0.05;
          } else if (t < 0.6) {
            // 劈下：大弧线斩落
            const s = (t - 0.2) / 0.4;
            const angle = -Math.PI * 0.3 + s * Math.PI * 0.7;
            const r = 100;
            dx = -40 + Math.cos(angle + Math.PI * 0.5) * r * s;
            dy = -80 + Math.sin(angle + Math.PI * 0.5) * r * s + 160 * s;
            rot = -1.2 + s * 2.8;
            scale = 1 + s * 0.7;
          } else if (t < 0.8) {
            // 劈后停顿+震颤
            const s = (t - 0.6) / 0.2;
            dy = 80 + Math.sin(s * 15) * 4 * (1 - s);
            rot = 1.6 - s * 0.2;
            scale = 1.7 + Math.sin(s * 20) * 0.08 * (1 - s);
          } else {
            // 收刀淡出
            const s = (t - 0.8) / 0.2;
            dy = 80 - s * 80;
            rot = 1.4 - s * 1.4;
            scale = 1.7 - s * 0.7;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 第一层：刃光弧线（沿劈斩路径）
          for (let i = 0; i < 45; i++) {
            const frac = i / 45;
            const angle = -Math.PI * 0.3 + frac * Math.PI * 0.7;
            const r = 100;
            const px = cx - 40 + Math.cos(angle + Math.PI * 0.5) * r * frac;
            const py = cy - 80 + Math.sin(angle + Math.PI * 0.5) * r * frac + 160 * frac;
            const tangent = angle + Math.PI * 0.5;
            const sp = rand(8, 20);
            out.push({ x: px, y: py,
              vx: Math.cos(tangent) * sp, vy: Math.sin(tangent) * sp,
              life: 1, decay: rand(0.015, 0.028), size: rand(4, 10),
              hue: rand(38, 58), gravity: 0.02, shape: 1, angle: tangent });
          }
          // 第二层：劈斩端点火花爆溅
          for (let i = 0; i < 18; i++) {
            const a = rand(-1.5, 0.6) + Math.PI * 0.4;
            const sp = rand(5, 14);
            out.push({ x: cx + 60, y: cy + 80, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.018, 0.032), size: rand(3, 7),
              hue: rand(18, 46), gravity: 0.12, shape: 0, angle: 0 });
          }
          // 第三层：铁屑碎片
          for (let i = 0; i < 10; i++) {
            const a = rand(-1.0, 0.3) + Math.PI * 0.4;
            const sp = rand(4, 10);
            out.push({ x: cx + 60, y: cy + 80, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2.5, 5),
              hue: rand(25, 42), gravity: 0.18, shape: 2, angle: rand(0, TAU) });
          }
          return out;
        },
      };
    // ── bow · 弓箭齐射：拉弦→蓄力→射出箭矢 ─────────────────────────────
    case 'bow':
      return {
        hue: 42,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.3) {
            // 拉弦蓄力
            const s = t / 0.3;
            dx = -s * 30;
            scale = 0.8 + s * 0.2;
            rot = s * 0.2;
          } else if (t < 0.6) {
            // 箭矢射出
            const s = (t - 0.3) / 0.3;
            dx = -30 + s * 300;
            dy = -s * 80;
            scale = 1 + s * 0.3;
            rot = s * 0.5;
          } else {
            // 远去淡出
            const s = (t - 0.6) / 0.4;
            dx = 270 + s * 100;
            dy = -80 - s * 40;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 箭矢轨迹
          for (let i = 0; i < 25; i++) {
            const frac = i / 25;
            out.push({ x: cx + frac * 280, y: cy - frac * 70, vx: 12 + rand(0, 3), vy: -2 + rand(-0.5, 0.5),
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
              hue: rand(38, 52), gravity: 0.02, shape: 1, angle: -0.25 });
          }
          // 弦弹火花
          for (let i = 0; i < 15; i++) {
            const a = rand(0.5, 1.5);
            const sp = rand(3, 8);
            out.push({ x: cx - 20, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.025, 0.04), size: rand(2, 4),
              hue: rand(20, 40), gravity: 0.1, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── shield · 盾牌防护：冲击波扩散+光晕 ─────────────────────────────
    case 'shield':
      return {
        hue: 205,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 收缩蓄力
            const s = t / 0.2;
            scale = 1.2 - s * 0.4;
          } else if (t < 0.6) {
            // 冲击波扩散
            const s = (t - 0.2) / 0.4;
            scale = 0.8 + s * 1.2;
            rot = s * 0.3;
          } else {
            // 光晕淡出
            const s = (t - 0.6) / 0.4;
            scale = 2.0 + s * 0.5;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 冲击波环
          for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * TAU;
            const sp = rand(5, 12);
            out.push({ x: cx, y: cy, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(3, 6),
              hue: rand(195, 215), gravity: 0, shape: 1, angle: angle });
          }
          return out;
        },
      };

    // ── bomb · 炸弹爆炸：爆炸扩散+碎片飞溅 ─────────────────────────────
    case 'bomb':
      return {
        hue: 15,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.1) {
            // 点火闪烁
            scale = 1 + Math.sin(t * 80) * 0.3;
          } else if (t < 0.4) {
            // 爆炸扩散
            const s = (t - 0.1) / 0.3;
            scale = 1.3 + s * 1.7;
            rot = s * 0.5;
          } else {
            // 消散
            const s = (t - 0.4) / 0.6;
            scale = 3.0 + s * 0.5;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 爆炸碎片
          for (let i = 0; i < 35; i++) {
            const angle = (i / 35) * TAU + rand(-0.2, 0.2);
            const sp = rand(6, 18);
            out.push({ x: cx, y: cy, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2.5, 5),
              hue: rand(10, 30), gravity: 0.15, shape: 2, angle: rand(0, TAU) });
          }
          return out;
        },
      };

    // ── hammer · 铁锤重击：向下猛击+地面震荡 ─────────────────────────────
    case 'hammer':
      return {
        hue: 30,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 举起蓄力
            const s = t / 0.15;
            dy = -s * 120;
            rot = -s * 0.8;
          } else if (t < 0.35) {
            // 猛击下落
            const s = (t - 0.15) / 0.2;
            dy = -120 + s * 240;
            rot = -0.8 + s * 1.2;
          } else {
            // 震荡淡出
            const s = (t - 0.35) / 0.65;
            dy = 120 + Math.sin(s * 15) * 10 * (1 - s);
            scale = 1.3 - s * 0.3;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 地面震荡波
          for (let i = 0; i < 20; i++) {
            const angle = rand(0.3, 0.8);
            const sp = rand(4, 10);
            out.push({ x: cx + 40, y: cy + 120, vx: Math.cos(angle) * sp, vy: -Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
              hue: rand(25, 45), gravity: 0.12, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── scepter · 权杖加冕：光芒四射+旋转上升 ─────────────────────────────
    case 'scepter':
      return {
        hue: 45,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 预备
            scale = 0.9;
          } else if (t < 0.5) {
            // 光芒扩散
            const s = (t - 0.2) / 0.3;
            scale = 0.9 + s * 1.1;
            rot = s * 1.0;
          } else {
            // 上升淡出
            const s = (t - 0.5) / 0.5;
            dy = -s * 80;
            scale = 2.0 + s * 0.3;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 光芒四射
          for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * TAU;
            const sp = rand(4, 14);
            out.push({ x: cx, y: cy, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2.5, 6),
              hue: rand(40, 58), gravity: 0, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── amulet · 护符魔力：魔法光环旋转扩散 ─────────────────────────────
    case 'amulet':
      return {
        hue: 270,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 凝聚
            scale = 1.3 - t / 0.2 * 0.5;
          } else if (t < 0.5) {
            // 释放光环
            const s = (t - 0.2) / 0.3;
            scale = 0.8 + s * 1.2;
            rot = s * 1.5;
          } else {
            // 扩散淡出
            const s = (t - 0.5) / 0.5;
            scale = 2.0 + s * 0.5;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 魔法光环
          for (let i = 0; i < 35; i++) {
            const angle = (i / 35) * TAU;
            const sp = rand(4, 12);
            out.push({ x: cx, y: cy, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.018, 0.03), size: rand(2, 5),
              hue: rand(250, 290), gravity: 0, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── dagger · 匕首刺击：快速穿刺+血花飞溅 ─────────────────────────────
    case 'dagger':
      return {
        hue: 0,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.1) {
            // 蓄力
            const s = t / 0.1;
            dx = -s * 20;
            rot = -s * 0.5;
          } else if (t < 0.3) {
            // 快速穿刺
            const s = (t - 0.1) / 0.2;
            dx = -20 + s * 180;
            dy = -s * 40;
            rot = -0.5 + s * 1.0;
            scale = 1 + s * 0.4;
          } else {
            // 淡出
            const s = (t - 0.3) / 0.7;
            dx = 160 + s * 30;
            dy = -40 - s * 20;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 血花飞溅
          for (let i = 0; i < 20; i++) {
            const angle = rand(0.3, 1.2);
            const sp = rand(3, 9);
            out.push({ x: cx + 30, y: cy - 10, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4.5),
              hue: rand(350, 15), gravity: 0.1, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── boomerang · 回旋镖飞回：抛出→弧线→飞回 ─────────────────────────────
    case 'boomerang':
      return {
        hue: 20,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.3) {
            // 抛出
            const s = t / 0.3;
            dx = s * 200;
            dy = -s * 60;
            rot = s * 4;
          } else if (t < 0.7) {
            // 弧线飞行
            const s = (t - 0.3) / 0.4;
            dx = 200 - s * 120;
            dy = -60 + Math.sin(s * Math.PI) * 40;
            rot = 1.2 + s * 3;
          } else {
            // 飞回
            const s = (t - 0.7) / 0.3;
            dx = 80 - s * 80;
            dy = -20 + s * 20;
            rot = 4.2 + s * 2;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 旋转轨迹
          for (let i = 0; i < 20; i++) {
            const frac = i / 20;
            const angle = frac * 4;
            const px = cx + frac * 200;
            const py = cy - Math.sin(frac * Math.PI) * 60;
            out.push({ x: px + Math.cos(angle) * 8, y: py + Math.sin(angle) * 8,
              vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
              hue: rand(15, 30), gravity: 0.05, shape: 0, angle: angle });
          }
          return out;
        },
      };

    // ── spear · 长矛投掷：蓄力→投掷→穿刺 ─────────────────────────────
    case 'spear':
      return {
        hue: 25,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 蓄力
            const s = t / 0.2;
            dx = -s * 40;
            dy = s * 20;
            rot = -s * 0.8;
          } else if (t < 0.5) {
            // 投掷飞行
            const s = (t - 0.2) / 0.3;
            dx = -40 + s * 280;
            dy = 20 - s * 80;
            rot = -0.8 + s * 1.5;
            scale = 1 + s * 0.4;
          } else {
            // 远去淡出
            const s = (t - 0.5) / 0.5;
            dx = 240 + s * 60;
            dy = -60 - s * 30;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 穿刺轨迹
          for (let i = 0; i < 20; i++) {
            const frac = i / 20;
            out.push({ x: cx - 30 + frac * 260, y: cy + 15 - frac * 70,
              vx: 8 + rand(0, 2), vy: -1.5 + rand(-0.3, 0.3),
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4.5),
              hue: rand(20, 40), gravity: 0.05, shape: 1, angle: -0.2 });
          }
          return out;
        },
      };

    // ── axe · 战斧劈砍：旋转挥砍→落地冲击 ─────────────────────────────
    case 'axe':
      return {
        hue: 15,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 举起
            const s = t / 0.15;
            dx = -s * 30;
            dy = -s * 80;
            rot = -s * 1.2;
          } else if (t < 0.4) {
            // 挥砍
            const s = (t - 0.15) / 0.25;
            dx = -30 + s * 160;
            dy = -80 + s * 180;
            rot = -1.2 + s * 2.5;
            scale = 1 + s * 0.5;
          } else {
            // 震荡淡出
            const s = (t - 0.4) / 0.6;
            dy = 100 + Math.sin(s * 12) * 8 * (1 - s);
            scale = 1.5 - s * 0.3;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 挥砍弧线
          for (let i = 0; i < 22; i++) {
            const frac = i / 22;
            const angle = -1.2 + frac * 2.5;
            const px = cx - 30 + Math.cos(angle + 1.5) * 80 * frac;
            const py = cy - 80 + Math.sin(angle + 1.5) * 80 * frac + 160 * frac;
            out.push({ x: px, y: py, vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6,
              life: 1, decay: rand(0.02, 0.035), size: rand(2.5, 5),
              hue: rand(10, 30), gravity: 0.08, shape: 1, angle: angle });
          }
          return out;
        },
      };

    // ── scythe · 镰刀挥舞：弧形挥割+死亡气息 ─────────────────────────────
    case 'scythe':
      return {
        hue: 0,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 举起
            const s = t / 0.2;
            dy = -s * 80;
            rot = -s * 1.0;
          } else if (t < 0.5) {
            // 弧形挥割
            const s = (t - 0.2) / 0.3;
            dy = -80 + Math.sin(s * Math.PI) * 120;
            rot = -1.0 + s * 2.0;
            scale = 1 + s * 0.6;
          } else {
            // 死亡气息扩散
            const s = (t - 0.5) / 0.5;
            dy = 40 - s * 40;
            scale = 1.6 - s * 0.5;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 死亡气息
          for (let i = 0; i < 25; i++) {
            const angle = rand(0, TAU);
            const sp = rand(2, 6);
            out.push({ x: cx, y: cy, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp - 1,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
              hue: rand(0, 15), gravity: 0.02, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── trident · 三叉戟海啸：三重冲击波 ─────────────────────────────
    case 'trident':
      return {
        hue: 200,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 蓄力
            const s = t / 0.15;
            scale = 1.2 - s * 0.3;
          } else if (t < 0.4) {
            // 冲击
            const s = (t - 0.15) / 0.25;
            scale = 0.9 + s * 1.6;
            rot = s * 0.8;
          } else {
            // 波纹消散
            const s = (t - 0.4) / 0.6;
            scale = 2.5 + s * 0.3;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 三重冲击波
          for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 12; i++) {
              const angle = (i / 12) * TAU;
              const sp = 4 + j * 4 + rand(0, 3);
              out.push({ x: cx, y: cy, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
                life: 1, decay: rand(0.02 + j * 0.005, 0.035 + j * 0.005),
                size: rand(2.5, 5), hue: rand(190, 215), gravity: 0, shape: 1, angle: angle });
            }
          }
          return out;
        },
      };

    // ── flail · 连枷横扫：甩链→砸地 ─────────────────────────────
    case 'flail':
      return {
        hue: 35,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 甩链
            const s = t / 0.2;
            dx = s * 60;
            dy = -s * 30;
            rot = s * 1.5;
          } else if (t < 0.5) {
            // 砸落
            const s = (t - 0.2) / 0.3;
            dx = 60 - s * 40;
            dy = -30 + s * 150;
            rot = 1.5 + s * 1.0;
          } else {
            // 震动
            const s = (t - 0.5) / 0.5;
            dx = 20 + Math.sin(s * 15) * 8 * (1 - s);
            dy = 120 + Math.sin(s * 12) * 6 * (1 - s);
            scale = 1.3 - s * 0.3;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 撞击碎片
          for (let i = 0; i < 18; i++) {
            const angle = rand(0.2, 1.0);
            const sp = rand(3, 9);
            out.push({ x: cx + 30, y: cy + 120, vx: Math.cos(angle) * sp, vy: -Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
              hue: rand(30, 50), gravity: 0.12, shape: 2, angle: rand(0, TAU) });
          }
          return out;
        },
      };

    // ── chakram · 轮刃旋转：旋转飞出→环切→飞回 ─────────────────────────────
    case 'chakram':
      return {
        hue: 45,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.3) {
            // 旋转飞出
            const s = t / 0.3;
            dx = s * 150;
            dy = -s * 50;
            rot = s * 8;
            scale = 1 + s * 0.3;
          } else if (t < 0.7) {
            // 环切
            const s = (t - 0.3) / 0.4;
            dx = 150 - s * 80;
            dy = -50 + Math.sin(s * Math.PI) * 30;
            rot = 2.4 + s * 6;
          } else {
            // 飞回
            const s = (t - 0.7) / 0.3;
            dx = 70 - s * 70;
            dy = 0 + s * 0;
            rot = 8.4 + s * 4;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 旋转轨迹
          for (let i = 0; i < 25; i++) {
            const frac = i / 25;
            const angle = frac * 10;
            const px = cx + frac * 150;
            const py = cy - Math.sin(frac * Math.PI) * 50;
            out.push({ x: px + Math.cos(angle) * 10, y: py + Math.sin(angle) * 10,
              vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4,
              life: 1, decay: rand(0.018, 0.03), size: rand(2, 5),
              hue: rand(40, 60), gravity: 0, shape: 0, angle: angle });
          }
          return out;
        },
      };

    // ── halberd · 戟刺击：刺穿+回旋 ─────────────────────────────
    case 'halberd':
      return {
        hue: 10,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 后撤蓄力
            const s = t / 0.15;
            dx = -s * 40;
            dy = -s * 60;
            rot = -s * 0.8;
          } else if (t < 0.4) {
            // 刺出
            const s = (t - 0.15) / 0.25;
            dx = -40 + s * 240;
            dy = -60 + s * 120;
            rot = -0.8 + s * 2.0;
            scale = 1 + s * 0.5;
          } else {
            // 回旋淡出
            const s = (t - 0.4) / 0.6;
            dx = 200 - s * 60;
            dy = 60 - s * 40;
            rot = 1.2 + s * 0.8;
            scale = 1.5 - s * 0.3;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 刺击轨迹
          for (let i = 0; i < 18; i++) {
            const frac = i / 18;
            out.push({ x: cx - 30 + frac * 220, y: cy - 50 + frac * 110,
              vx: 7 + rand(0, 2), vy: 2 + rand(-0.5, 0.5),
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 5),
              hue: rand(5, 25), gravity: 0.06, shape: 1, angle: 0.4 });
          }
          return out;
        },
      };

    // ── slingshot · 弹弓发射：拉伸→弹射→飞远 ─────────────────────────────
    case 'slingshot':
      return {
        hue: 30,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 拉伸蓄力
            const s = t / 0.2;
            dx = s * 20;
            scale = 1 - s * 0.1;
          } else if (t < 0.4) {
            // 弹射
            const s = (t - 0.2) / 0.2;
            dx = 20 + s * 160;
            dy = -s * 60;
            scale = 0.9 + s * 0.6;
            rot = s * 0.5;
          } else {
            // 飞远
            const s = (t - 0.4) / 0.6;
            dx = 180 + s * 80;
            dy = -60 - s * 30;
            alpha = 1 - s * s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 弹射轨迹
          for (let i = 0; i < 15; i++) {
            const frac = i / 15;
            out.push({ x: cx + frac * 170, y: cy - frac * 55,
              vx: 8 + rand(0, 2), vy: -2 + rand(-0.3, 0.3),
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
              hue: rand(25, 45), gravity: 0.08, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── blowgun · 吹箭破空：吹气→箭矢飞出 ─────────────────────────────
    case 'blowgun':
      return {
        hue: 50,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.1) {
            // 吹气
            const s = t / 0.1;
            scale = 1 + s * 0.1;
          } else if (t < 0.3) {
            // 箭矢飞出
            const s = (t - 0.1) / 0.2;
            dx = s * 220;
            rot = s * 0.2;
          } else {
            // 远去
            const s = (t - 0.3) / 0.7;
            dx = 220 + s * 60;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 气流轨迹
          for (let i = 0; i < 12; i++) {
            const frac = i / 12;
            out.push({ x: cx + frac * 200, y: cy + rand(-2, 2),
              vx: 10 + rand(0, 3), vy: rand(-0.2, 0.2),
              life: 1, decay: rand(0.02, 0.035), size: rand(1.5, 3.5),
              hue: rand(40, 60), gravity: 0, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    // ── tessen · 铁扇展开：展开→扇面切割 ─────────────────────────────
    case 'tessen':
      return {
        hue: 30,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.15) {
            // 预备
            const s = t / 0.15;
            rot = -s * 0.5;
          } else if (t < 0.4) {
            // 展开挥出
            const s = (t - 0.15) / 0.25;
            dx = s * 140;
            dy = -s * 40;
            rot = -0.5 + s * 1.5;
            scale = 1 + s * 0.4;
          } else {
            // 收回淡出
            const s = (t - 0.4) / 0.6;
            dx = 140 - s * 80;
            dy = -40 + s * 20;
            rot = 1.0 + s * 0.5;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 扇面切割轨迹
          for (let i = 0; i < 16; i++) {
            const angle = rand(0, 0.8);
            const sp = rand(4, 10);
            out.push({ x: cx + 30, y: cy - 10, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4.5),
              hue: rand(25, 45), gravity: 0.05, shape: 1, angle: angle });
          }
          return out;
        },
      };

    // ── chain · 锁链拖曳：甩链→缠绕→拖拽 ─────────────────────────────
    case 'chain':
      return {
        hue: 35,
        sprite: (t) => {
          let dx = 0, dy = 0, scale = 1, rot = 0, alpha = 1;
          if (t < 0.2) {
            // 甩链
            const s = t / 0.2;
            dx = s * 80;
            dy = -s * 30;
            rot = s * 1.0;
          } else if (t < 0.5) {
            // 缠绕
            const s = (t - 0.2) / 0.3;
            dx = 80 - s * 30;
            dy = -30 + Math.sin(s * Math.PI * 2) * 20;
            rot = 1.0 + s * 2.0;
          } else {
            // 拖拽淡出
            const s = (t - 0.5) / 0.5;
            dx = 50 + s * 30;
            dy = 0 + s * 40;
            rot = 3.0 + s * 1.5;
            scale = 1.2 - s * 0.2;
            alpha = 1 - s;
          }
          return { dx, dy, scale, rot, alpha };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 锁链碎片
          for (let i = 0; i < 15; i++) {
            const angle = rand(0, TAU);
            const sp = rand(2, 5);
            out.push({ x: cx + rand(0, 80), y: cy + rand(-30, 30),
              vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4),
              hue: rand(30, 50), gravity: 0.08, shape: 0, angle: 0 });
          }
          return out;
        },
      };

    default:
      // 通用锻造橙爆裂（自定义素材）。
      return {
        hue: 24,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 1.4, rot: 0, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 28, 3, 10, () => rand(16, 40), 0, 0.06),
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

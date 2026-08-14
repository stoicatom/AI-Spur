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
const CRACK_MS = 720; // 爆裂动画时长

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
 */
export class MaterialTrail {
  private points: TrailPoint[] = [];
  private readonly max = 14;
  private hue = 24;

  /** 素材切换时设定拖尾色相（与素材呼应）。 */
  setHue(hue: number): void {
    this.hue = hue;
  }

  clear(): void {
    this.points = [];
  }

  push(x: number, y: number, now: number): void {
    const last = this.points[this.points.length - 1];
    // 仅在移动足够时记点，避免静止时堆叠。
    if (last && Math.hypot(x - last.x, y - last.y) < 4) return;
    this.points.push({ x, y, t: now });
    if (this.points.length > this.max) this.points.shift();
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.points.length < 2) return;
    // 老点在 220ms 后淡尽。
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const age = now - b.t;
      const life = Math.max(0, 1 - age / 220);
      if (life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = life * 0.5 * (i / this.points.length);
      ctx.strokeStyle = `hsl(${this.hue}, 100%, 62%)`;
      ctx.lineWidth = 10 * life * (i / this.points.length);
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
    case 'rocket':
      // 升空：精灵向上加速冲出，尾部橙焰粒子向下喷、扩成烟云。
      return {
        hue: 26,
        sprite: (t) => ({ dx: 0, dy: -t * t * 420, scale: 1 + t * 0.25, rot: 0, alpha: 1 - t * 0.4 }),
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 46; i++) {
            const a = Math.PI / 2 + rand(-0.6, 0.6); // 朝下
            const sp = rand(2, 8);
            out.push({ x: cx, y: cy + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.04), size: rand(2, 5), hue: rand(18, 44), gravity: -0.02, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    case 'lightning':
      // 劈裂：精灵原地闪一下即隐，多道电弧 streak 放射。
      return {
        hue: 205,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 0.6, rot: 0, alpha: Math.max(0, 1 - t * 3) }),
        emit: (cx, cy) => ring(cx, cy, 14, 6, 13, () => rand(195, 215), 'streak', 0),
      };
    case 'flame':
      // 上腾：精灵向上舒展放大，火星向上飘散。
      return {
        hue: 20,
        sprite: (t) => ({ dx: 0, dy: -t * 120, scale: 1 + t * 1.4, rot: 0, alpha: 1 - t * t }),
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 34; i++) {
            const a = -Math.PI / 2 + rand(-0.5, 0.5);
            const sp = rand(1.5, 6);
            out.push({ x: cx + rand(-14, 14), y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.012, 0.024), size: rand(2, 5), hue: rand(14, 44), gravity: -0.05, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    case 'star':
      // 绽放：精灵四射放大后淡出，金色星尘环扩散。
      return {
        hue: 45,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 1.6, rot: t * 0.6, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 40, 3, 11, () => rand(40, 56), 'dot', 0.02),
      };
    case 'meteor':
      // 坠击：精灵沿右下俯冲，落点橙色冲击 streak 环。
      return {
        hue: 30,
        sprite: (t) => ({ dx: t * 140, dy: t * 140, scale: 1 - t * 0.3, rot: 0, alpha: 1 - t }),
        emit: (cx, cy) => ring(cx + 90, cy + 90, 26, 4, 12, () => rand(20, 42), 'streak', 0.08),
      };
    case 'skull':
      // 碎裂：精灵裂开抖散，红色余烬碎片下落。
      return {
        hue: 8,
        sprite: (t) => ({ dx: Math.sin(t * 40) * 6 * (1 - t), dy: t * 40, scale: 1 - t * 0.5, rot: rand(-0.02, 0.02), alpha: 1 - t }),
        emit: (cx, cy) => ring(cx, cy, 30, 3, 9, () => rand(2, 20), 'shard', 0.12),
      };
    case 'sword':
      // 挥斩：精灵快速斜向劈出并放大淡出，沿刃迹迸射金橙火花条。
      return {
        hue: 24,
        sprite: (t) => ({ dx: t * 90, dy: -t * 30, scale: 1 + t * 0.5, rot: t * 0.5, alpha: Math.max(0, 1 - t * 1.4) }),
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 沿一条斜向刃迹撒火花条（右上—左下）。
          for (let i = 0; i < 34; i++) {
            const along = (i / 34 - 0.5) * 120;
            const px = cx + along * 0.9;
            const py = cy - along * 0.5;
            const a = rand(-0.5, 0.5) - Math.PI / 4;
            const sp = rand(5, 13);
            out.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4.5), hue: rand(20, 46), gravity: 0.05, shape: 'streak', angle: a });
          }
          return out;
        },
      };
    case 'crown':
      // 加冕：精灵上抛旋转放大，宝石光点环绕迸发。
      return {
        hue: 45,
        sprite: (t) => ({ dx: 0, dy: -t * 60, scale: 1 + t * 0.5, rot: t * TAU, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 32, 2.5, 9, () => (Math.random() < 0.5 ? rand(40, 52) : rand(200, 212)), 'dot', -0.02),
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
    const { w, h } = fitSize(this.img, CURSOR_MAX_PX);
    ctx.drawImage(this.img, x - w / 2, y - h / 2, w, h);
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

    // 粒子。
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= p.decay;
      if (p.life <= 0) continue;
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
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // 素材精灵：按专属运动轨迹位移 / 缩放 / 旋转 / 淡出。
    if (this.ready) {
      const s = this.style.sprite(t);
      const { w, h } = fitSize(this.img, CURSOR_MAX_PX);
      const iw = w * s.scale;
      const ih = h * s.scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.translate(cx + s.dx, cy + s.dy);
      if (s.rot) ctx.rotate(s.rot);
      ctx.drawImage(this.img, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    }
  }
}

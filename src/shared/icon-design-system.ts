/**
 * 素材图标设计系统规范（设计规格 §5）。
 *
 * 42 枚内置图标已共享同一套视觉语言，本模块把那套语言写成**机器可验证的约束**，
 * 而非文档里的口号：新增素材若偏离栅格、描边或色板体系，测试直接失败。
 *
 * 为什么用校验而不是重绘：审计确认 42 枚图标的 viewBox、渐变体系、发光滤镜、
 * 描边基准已经一致（211/220 处描边为 1.5，全部 42 枚使用 CSS 变量色板与
 * 渐变+滤镜）。缺的是「防止漂移」的机制，不是「统一现状」的返工。
 *
 * 图标经 `<img src={dataUri}>` 渲染（MaterialPacksPanel），每个 img 是独立
 * 文档，因此 SVG 内部 id 不会跨图标冲突——规范不约束 id 命名，只约束视觉量。
 */

/** 统一栅格边长（px）。全部 42 枚为 48×48。 */
export const ICON_CANVAS = 48;

/**
 * 主描边宽度。
 *
 * 1.5 在 48px 栅格下缩到设置页的 28px 展示尺寸仍有约 0.9px 实际宽度，
 * 是「缩小后不消失、放大后不笨重」的平衡点。
 */
export const ICON_STROKE = 1.5;

/**
 * 允许的描边宽度白名单。
 *
 * 主描边之外只开三个口子，每个都有光学理由：
 * - `0.8` 细节层（内部纹理、次级刻线），比主描边细一档形成层次
 * - `2` / `2.5` / `3` 重量级主体（斧刃、枪管、矛杆），厚重感是素材语义本身
 *
 * 不在白名单内的宽度说明作者在随手调数值，而不是在用这套层级。
 */
export const ALLOWED_STROKE_WIDTHS = [0.8, 1.5, 2, 2.5, 3] as const;

/**
 * 安全边距（px）。
 *
 * 图形不应贴死 48 栅格边缘：设置页卡片给图标 28px 展示框并带圆角裁切，
 * 贴边的笔画在缩放与抗锯齿后会被切掉半个像素。2px 是最小可靠留白。
 */
export const ICON_SAFE_MARGIN = 2;

/** SVG 根元素必须声明的属性，保证 42 枚在任意容器里表现一致。 */
export const REQUIRED_ROOT_ATTRS = {
  viewBox: `0 0 ${ICON_CANVAS} ${ICON_CANVAS}`,
  fill: 'none',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  preserveAspectRatio: 'xMidYMid meet',
  'shape-rendering': 'geometricPrecision',
} as const;

export type IconViolation = {
  /** 违规类型，供测试输出定位。 */
  kind: 'root-attr' | 'stroke-width' | 'missing-title' | 'missing-palette' | 'missing-depth';
  /** 人类可读说明。 */
  detail: string;
};

/** 单枚图标的校验结果。 */
export type IconAudit = {
  packId: string;
  violations: IconViolation[];
};

function checkRootAttrs(svg: string): IconViolation[] {
  const out: IconViolation[] = [];
  for (const [attr, expected] of Object.entries(REQUIRED_ROOT_ATTRS)) {
    if (!svg.includes(`${attr}="${expected}"`)) {
      out.push({ kind: 'root-attr', detail: `根元素缺少 ${attr}="${expected}"` });
    }
  }
  return out;
}

function checkStrokeWidths(svg: string): IconViolation[] {
  const found = svg.match(/stroke-width="([^"]+)"/g) ?? [];
  const bad = new Set<string>();
  for (const raw of found) {
    const value = raw.slice('stroke-width="'.length, -1);
    const numeric = Number.parseFloat(value);
    if (!ALLOWED_STROKE_WIDTHS.some((w) => Math.abs(w - numeric) < 1e-6)) bad.add(value);
  }
  return [...bad].map((value) => ({
    kind: 'stroke-width' as const,
    detail: `描边宽度 ${value} 不在白名单 [${ALLOWED_STROKE_WIDTHS.join(', ')}] 内`,
  }));
}

/**
 * 校验一枚图标。
 *
 * 只读 SVG 源文本，不解析 DOM：规范约束的都是可文本判定的量，
 * 引入解析器会让这层校验依赖运行时环境。
 */
export function auditIconSvg(packId: string, svg: string): IconAudit {
  const violations: IconViolation[] = [
    ...checkRootAttrs(svg),
    ...checkStrokeWidths(svg),
  ];

  // 无障碍：每枚图标要有 <title>，读屏器据此播报素材名。
  if (!/<title>[^<]+<\/title>/.test(svg)) {
    violations.push({ kind: 'missing-title', detail: '缺少 <title> 无障碍标题' });
  }

  // 色板体系：颜色必须走 var(--pack-*) 而非硬编码，主题才能整体换色。
  if (!svg.includes('var(--pack-')) {
    violations.push({ kind: 'missing-palette', detail: '未使用 var(--pack-*) 色板变量' });
  }

  // 立体感：渐变提供体积、滤镜提供发光，两者是这套图标「不扁平」的来源。
  const hasGradient = svg.includes('linearGradient') || svg.includes('radialGradient');
  const hasGlow = svg.includes('filter') || svg.includes('feGaussianBlur');
  if (!hasGradient || !hasGlow) {
    violations.push({
      kind: 'missing-depth',
      detail: `缺少${hasGradient ? '' : '渐变'}${!hasGradient && !hasGlow ? '与' : ''}${hasGlow ? '' : '发光滤镜'}`,
    });
  }

  return { packId, violations };
}

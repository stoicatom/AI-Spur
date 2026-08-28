# AISpur CG 特效 — 计划 C（图标统一 · 改名 · 全量回归）

> **For agentic workers:** 本计划由 workflow 派发。C1 可与计划 B 并行（不碰特效代码）；C3–C5 必须在计划 B 全部完成后执行。

**Goal:** 侧边栏"素材包"改名"素材库"；42 枚内置图标建立统一设计系统并重绘；全量回归（测试 / 降级链 / 性能 / 打包体积）。

**Tech Stack:** SVG（48×48 viewBox）/ React 18 / Vitest / Rust cargo test / Tauri 2。

## Global Constraints

- 图标只改 `src-tauri/packs/<id>/icon.svg`；不改 `pack.json`，不改 Rust 扫描逻辑（dataUri 自动内联）。
- 不触碰 `src-tauri/materials/`（v2 遗留目录）。
- SVG 必须：`viewBox="0 0 48 48"`、无外部引用、无 `<script>`、无 base64 位图、文件 ≤ 8KB。
- 提交信息带 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。

---

### Task C1: 侧边栏"素材包"→"素材库"

**Files:**
- Modify: `src/settings/panels.ts:52`（`{ id: 'skins', label: '素材包', icon: 'skins' }` → `label: '素材库'`）
- Modify: `src/settings/components/MaterialPacksPanel.tsx:164`（"正在读取素材包…" → "正在读取素材库…"）、`:196`（`aria-label="素材包"` → `"素材库"`）
- Modify: `src/settings/components/SoundsPanel.tsx:9`（正文中「素材包」面板名 → 「素材库」）
- Test: `src/__tests__/settings-panels.test.tsx`（追加）

**Interfaces:**
- Produces: 侧边栏 tab 名为「素材库」；面板内文案一致。

- [ ] **Step 1: 写失败测试**

```typescript
it('侧边栏素材库标签', () => {
  render(<App />);
  expect(screen.getByRole('tab', { name: '素材库' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: '素材包' })).toBeNull();
});
```

- [ ] **Step 2: 跑红**

```bash
pnpm vitest run src/__tests__/settings-panels.test.tsx
```

预期：FAIL（找不到「素材库」tab）。

- [ ] **Step 3: 实现**（上述 4 处文案替换；其余含"素材包"的注释与向导标题保留——向导确实是在建"素材包"实体）

- [ ] **Step 4: 跑绿**

```bash
pnpm vitest run src/__tests__/settings-panels.test.tsx src/__tests__/settings-app.test.tsx src/__tests__/material-packs-panel.test.tsx && pnpm typecheck
```

预期：PASS（若旧测试断言了「素材包」文案，同步更新为「素材库」）。

- [ ] **Step 5: 提交**

```bash
git add src/settings/panels.ts src/settings/components/MaterialPacksPanel.tsx src/settings/components/SoundsPanel.tsx src/__tests__/settings-panels.test.tsx
git commit -m "feat(ui): 侧边栏素材包改名素材库

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task C2: 图标统一设计系统规范

**Files:**
- Create: `docs/superpowers/specs/2026-08-28-icon-design-system.md`

**Interfaces:**
- Produces: 42 枚图标重绘的强制规范，供 C3 的并行 agent 逐个遵循。

- [ ] **Step 1: 审计现状**

```bash
for f in src-tauri/packs/*/icon.svg; do echo "== $f"; head -3 "$f"; done | head -80
```

记录：现有 viewBox、渐变 id 命名法（如 `bh-disk`）、CSS 变量用法（如 `var(--pack-disk-cool,#4FB4BE)`）、stroke 宽度分布。

- [ ] **Step 2: 写规范文档**

内容必须包含（可量化、可校验）：
- **画布**：`viewBox="0 0 48 48"`，安全边距 3px（主体在 3..45 内）。
- **构图**：三层结构——底层辉光（径向渐变圆，r≤22）/ 主体（素材本体，占 60–75% 画幅）/ 顶层高光与运动轨迹（1–3 条）。
- **描边**：主体 `stroke-width: 2.2`，细节 `1.4`，`stroke-linecap="round"`、`stroke-linejoin="round"`。
- **渐变**：每图标 1–2 个 `linearGradient`（135° 方向：`x1="8" y1="8" x2="40" y2="40"`），id 前缀 = packId 缩写，保留 `var(--pack-*, #fallback)` 双色可主题化模式。
- **族语义色板**（主色相范围）：cosmic 250–290 / impact 8–32 / natural 150–195 / weapon 200–215（钢蓝）+ 中性银 / rhythm 38–50。每图标主色取所属族区间，并与 `pack.json` 的 `palette.particleHue` 保持 ±20 内一致。
- **辨识度**：主体轮廓在 24×24 缩放下仍可辨（禁止 <1.2px 的细节线）。
- **禁止**：位图、外部字体、`<text>`、`filter` 中的高斯模糊（性能）、超过 3 个渐变。

- [ ] **Step 3: 提交**

```bash
git add docs/superpowers/specs/2026-08-28-icon-design-system.md
git commit -m "docs: 42 图标统一设计系统规范

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task C3: 42 枚图标重绘（每图标一个 subagent 任务）

**Files（每个 agent 只改自己那一个）:**
- Modify: `src-tauri/packs/<packId>/icon.svg`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-28-icon-design-system.md`（C2 产出）
- Produces: 符合规范的 SVG，保留 `<title>` 中文名。

- [ ] **Step 1: 读规范与现状**

读 C2 规范；读自己的 `src-tauri/packs/<packId>/icon.svg` 现状与 `pack.json` 的 `palette.particleHue`、`name`。

- [ ] **Step 2: 重绘**

按规范三层结构重写 SVG。保留 `<title>` 内的中文素材名；主色取族区间且与 particleHue ±20 一致。

- [ ] **Step 3: 校验**

```bash
python3 - <<'EOF'
import re, sys, pathlib
p = pathlib.Path('src-tauri/packs/<packId>/icon.svg')
s = p.read_text()
assert 'viewBox="0 0 48 48"' in s, 'viewBox 必须 0 0 48 48'
assert '<script' not in s, '禁止 script'
assert 'data:image' not in s, '禁止位图'
assert '<text' not in s, '禁止 text'
assert len(s) <= 8192, f'文件过大 {len(s)}'
assert s.count('linearGradient') <= 4, '渐变过多'
print('ok', len(s), 'bytes')
EOF
```

预期：`ok`。

- [ ] **Step 4: 跑图标测试**

```bash
pnpm vitest run src/__tests__/material-pack-icons.test.ts
```

预期：PASS（该测试校验所有内置包图标存在且可解析）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/packs/<packId>/icon.svg
git commit -m "feat(icon): <packId> 图标按统一设计系统重绘

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task C4: 全量回归

**Files:** 无新增（仅修复回归失败）

- [ ] **Step 1: 前端全量**

```bash
pnpm typecheck && pnpm vitest run
```

预期：全绿。失败则修复（不得删除/跳过测试）。

- [ ] **Step 2: Rust 全量**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

预期：全绿。

- [ ] **Step 3: 生产构建**

```bash
pnpm build
```

预期：成功，无 TS 错误。

- [ ] **Step 4: 降级链验证**

```bash
pnpm vitest run src/__tests__/three-effect-host.test.ts src/__tests__/three-effect-lifecycle.test.ts src/__tests__/material-styles.test.ts src/__tests__/overlay-render-loop.test.ts
```

预期：WebGL 失败 → 2D canvas 回退路径测试全绿（这是"不影响原有功能"的核心门禁）。

- [ ] **Step 5: 提交修复（如有）**

```bash
git add -A && git commit -m "fix(cg): 全量回归修复

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task C5: 性能与体积验收

**Files:**
- Create: `docs/superpowers/reports/2026-08-28-cg-performance.md`

- [ ] **Step 1: 打包体积**

```bash
pnpm build && du -sh dist && ls -la dist/assets | head -20
```

记录 dist 体积与最大 chunk（three + quarks + postprocessing 会显著增大 bundle；设计已确认"不限制体积"，但需记录）。

- [ ] **Step 2: 帧耗时采样（替代固定 fps 断言）**

```bash
pnpm vitest run src/__tests__/quality-tier.test.ts
```

并在报告中记录 `AdaptiveQuality` 的降档/升档阈值与实测窗口行为。

- [ ] **Step 3: 写报告**

`docs/superpowers/reports/2026-08-28-cg-performance.md`：dist 体积、各档位参数表、自动降档实测行为、已知兼容性风险（WebGL1、透明窗口 + 后处理）。

- [ ] **Step 4: 提交**

```bash
git add docs/superpowers/reports/2026-08-28-cg-performance.md
git commit -m "docs: CG 特效性能与体积验收报告

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 交付判定

- [ ] 侧边栏为「素材库」
- [ ] 42 枚图标符合统一设计系统
- [ ] 42 场景全部实现且注册表测试绿
- [ ] `pnpm typecheck` / `pnpm vitest run` / `cargo test` / `cargo clippy -D warnings` 全绿
- [ ] 2D 降级链测试绿（原功能未受影响）
- [ ] 性能与体积报告已出

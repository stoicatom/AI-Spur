# UI 设计规则 — 精美设计与反 AI 味

## 强制约束

### R-UI-001：所有 UI 实现前必须调用 frontend-design skill

**任何可视化界面的实现（设置窗口、首次引导、通知、覆盖层 UI 元素）都必须先调用 `/frontend-design` skill。**

```bash
# 正确流程
1. 用户："实现设置窗口"
2. AI：先调用 Skill(skill='frontend-design', args='设置窗口 - 侧边导航 + 多面板配置')
3. frontend-design 输出设计方案（颜色、间距、字体、交互）
4. AI：严格按设计方案实现代码

# 错误流程（禁止）
1. 用户："实现设置窗口"
2. AI：直接写代码，使用 Tailwind 默认样式
```

**违反此规则的代码将在 code review 中被拒绝。**

---

## 禁止的 AI 味特征

### R-UI-002：禁止的颜色方案

❌ **禁止使用以下"AI 默认色"：**
- `bg-gray-50` / `bg-gray-100` / `bg-gray-200`（灰色系背景）
- `text-gray-600` / `text-gray-700`（灰色文字）
- `border-gray-300`（灰色边框）
- `blue-500` / `blue-600`（默认蓝）
- `indigo-500` / `indigo-600`（默认靛蓝）

✅ **必须使用 frontend-design skill 提供的品牌色：**
- 从产品定位推导颜色情感（OpenWhip = 趣味 + 效率 → 活力、运动感）
- 使用非预设的色相（例如：橙红 `#FF4400`、电光蓝 `#00AAFF`）
- 明确的明暗对比方案（Light/Dark 两套完整定义）

### R-UI-003：禁止的间距/圆角模式

❌ **禁止：**
- `p-4` / `p-6` / `p-8`（Tailwind 默认间距阶梯）
- `rounded-lg` / `rounded-xl`（默认圆角）
- `gap-4` / `gap-6`（默认 gap）

✅ **必须：**
- 使用 `rem` 或 `px` 明确指定非预设值（如 `padding: 1.375rem`）
- 圆角根据元素性质调整（按钮可能 `6px`，卡片可能 `12px`）
- 间距使用非 4 的倍数（如 `18px`、`22px`、`26px`）

### R-UI-004：禁止的字体栈

❌ **禁止：**
```css
font-family: ui-sans-serif, system-ui, sans-serif;
```

✅ **必须：**
```css
/* macOS */
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;

/* Windows */
font-family: "Segoe UI Variable", "Segoe UI", sans-serif;

/* Linux */
font-family: "Inter", "Roboto", sans-serif;
```

字重必须明确（不使用 `font-medium`）：
- 标题：`font-weight: 650`
- 正文：`font-weight: 400`
- 次要文字：`font-weight: 350`

### R-UI-005：禁止的按钮样式

❌ **禁止（AI 味浓重）：**
```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  保存
</button>
```

✅ **必须（有设计感）：**
```tsx
<button className="primary-button">
  保存
</button>

/* CSS */
.primary-button {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, #FF4400 0%, #FF6A00 100%);
  color: white;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: 0.01em;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(255, 68, 0, 0.2);
}

.primary-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 68, 0, 0.3);
}

.primary-button:active {
  transform: translateY(0);
}
```

### R-UI-006：禁止的卡片/面板样式

❌ **禁止：**
```tsx
<div className="bg-white rounded-lg shadow p-6">
```

✅ **必须：**
```tsx
<div className="settings-panel">

/* CSS */
.settings-panel {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 1.75rem;
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 4px 8px rgba(0, 0, 0, 0.02);
}

@media (prefers-color-scheme: dark) {
  .settings-panel {
    background: rgba(30, 30, 30, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
  }
}
```

---

## 强制的设计原则

### R-UI-007：动效必须有意义

所有过渡必须使用自定义缓动曲线，不使用 `ease` / `ease-in-out`：

```css
/* ✅ 正确 */
transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性 */
transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);       /* 流畅 */

/* ❌ 禁止 */
transition: all 0.3s ease;
```

动效时长指南：
- 微交互（hover、focus）：`100-150ms`
- 面板进出：`200-300ms`
- 页面切换：`300-400ms`

### R-UI-008：响应式断点非标准

不使用 Tailwind 默认断点（`sm: 640px` / `md: 768px` / `lg: 1024px`）。

自定义断点：
```css
/* OpenWhip 窗口尺寸 */
@custom-media --compact (max-width: 720px);
@custom-media --standard (min-width: 721px) and (max-width: 1080px);
@custom-media --wide (min-width: 1081px);
```

### R-UI-009：暗色模式必须独立设计

暗色模式不是"反转颜色"，必须重新设计：

```css
/* ❌ 错误：直接反转 */
:root { --bg: white; --text: black; }
@media (prefers-color-scheme: dark) {
  :root { --bg: black; --text: white; }
}

/* ✅ 正确：独立调色 */
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F8F8;
  --text-primary: #1A1A1A;
  --text-secondary: #666666;
  --accent: #FF4400;
  --surface-elevation: 0 2px 8px rgba(0, 0, 0, 0.06);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1C1C1E;
    --bg-secondary: #2C2C2E;
    --text-primary: #F5F5F7;
    --text-secondary: #98989D;
    --accent: #FF6A33; /* 暗色下提高亮度 */
    --surface-elevation: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
}
```

### R-UI-010：输入框必须有精致状态

```css
.input-field {
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.input-field:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(255, 68, 0, 0.1);
}

.input-field::placeholder {
  color: rgba(0, 0, 0, 0.3);
  font-weight: 350;
}
```

---

## 设置窗口特定要求

### R-UI-011：侧边导航必须有视觉层次

```tsx
// ✅ 正确
<nav className="sidebar">
  <div className="nav-section">
    <span className="section-label">配置</span>
    <NavItem icon="⚡" label="触发" active />
    <NavItem icon="💬" label="提示词" />
  </div>
  <div className="nav-section">
    <span className="section-label">外观</span>
    <NavItem icon="🎨" label="皮肤" />
    <NavItem icon="⚙️" label="动画" />
  </div>
</nav>

/* CSS */
.sidebar {
  width: 200px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-subtle);
  padding: 1.5rem 0.75rem;
}

.section-label {
  display: block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  margin: 1.5rem 0 0.5rem 0.75rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 450;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-item:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent);
  color: white;
  font-weight: 600;
}
```

### R-UI-012：面板切换必须有过渡

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activePanel}
    initial={{ opacity: 0, x: 10 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -10 }}
    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
  >
    {renderPanel()}
  </motion.div>
</AnimatePresence>
```

---

## 首次引导特定要求

### R-UI-013：引导步骤必须有进度指示

```tsx
// ✅ 正确
<div className="onboarding-progress">
  <Step completed label="快捷键" />
  <Step active label="提示词" />
  <Step label="完成" />
</div>

/* CSS */
.onboarding-progress {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.step {
  flex: 1;
  height: 3px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.step.completed,
.step.active {
  background: var(--accent);
}

.step.active::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3));
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
```

### R-UI-014：快捷键录制必须有视觉反馈

```tsx
<div className={`hotkey-recorder ${recording ? 'recording' : ''}`}>
  {recording ? (
    <>
      <span className="recording-indicator" />
      按下你的快捷键组合...
    </>
  ) : (
    displayHotkey || '点击录制'
  )}
</div>

/* CSS */
.hotkey-recorder {
  padding: 1rem 1.5rem;
  border: 2px dashed rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  text-align: center;
  font-size: 1.125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.hotkey-recorder.recording {
  border-style: solid;
  border-color: var(--accent);
  background: rgba(255, 68, 0, 0.05);
  animation: pulse 2s ease-in-out infinite;
}

.recording-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--accent);
  border-radius: 50%;
  margin-right: 0.5rem;
  animation: blink 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 68, 0, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(255, 68, 0, 0); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

---

## 验收标准

### R-UI-015：所有 UI 必须通过设计审查

PR 中包含 UI 代码时，必须附上：
1. **frontend-design skill 调用记录**（证明已使用 skill）
2. **截图对比**（实现 vs 设计方案）
3. **暗色模式截图**（必须同时提供）
4. **响应式截图**（至少 2 个断点）

未通过设计审查的 UI 代码不允许合并。

---

## 反例集锦（禁止出现）

```tsx
// ❌ AI 味浓重的设置面板
<div className="bg-gray-50 p-6 rounded-lg">
  <h2 className="text-xl font-bold mb-4">设置</h2>
  <input className="border border-gray-300 rounded px-3 py-2" />
  <button className="bg-blue-500 text-white px-4 py-2 rounded mt-4">
    保存
  </button>
</div>

// ✅ 有设计感的设置面板
<div className="settings-container">
  <h2 className="panel-title">设置</h2>
  <input className="styled-input" />
  <button className="primary-action">保存</button>
</div>
```

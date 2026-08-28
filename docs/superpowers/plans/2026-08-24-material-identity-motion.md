# 素材身份与局部动效升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让左轮手枪和神龙的素材细节与动效行为强绑定，并收敛无关的全屏背景光效。

**Architecture:** 保留现有 family stage 路由，在 `RevolverWeaponStage` 中补充局部阶段道具，在 `WaveNaturalStage` 中将龙的简化球段升级为分节身份组件；Canvas 降级配方继续提供同一叙事。共用 `FullFieldSpectacleLayer` 增加局部化策略，避免覆盖视口的泛化光场。

**Tech Stack:** TypeScript, Three.js, Canvas 2D, SVG, Vitest, Vite。

---

### Task 1: 建立回归测试（RED）

**Files:**
- Modify: `src/__tests__/three-weapon-stages.test.ts`
- Create: `src/__tests__/three-dragon-stage.test.ts`
- Modify: `src/__tests__/three-full-field-spectacle.test.ts`

- [ ] **Step 1: 为左轮增加阶段断言**

断言 `revolver-muzzle` 在 `t=0.04` 可见，`revolver-bullet` 在 `t=0.32` 向前移动且在 `t=0.68` 衰减，`revolver-impact-ring` 在 `t=0.72` 有非零尺度；保持弹壳自旋测试。

- [ ] **Step 2: 为神龙增加身份组件断言**

创建 wave/dragon 上下文，断言 `dragon-head`、`dragon-scale-0`、`dragon-spine-0`、`dragon-whisker-0`、`dragon-orb` 存在；更新两个时间点后头部位于龙身前方且龙珠随头部偏移。

- [ ] **Step 3: 为共用层增加局部化断言**

对 `gunshot` 或 `wave` 更新后断言 `full-field-atmosphere` 的透明度为零或低于局部舞台阈值，冲击环尺度不超过素材局部 reach。

- [ ] **Step 4: 运行针对性测试确认失败**

Run: `pnpm vitest run src/__tests__/three-weapon-stages.test.ts src/__tests__/three-dragon-stage.test.ts src/__tests__/three-full-field-spectacle.test.ts`

Expected: 新增断言失败，原因是对象或局部化行为尚不存在。

---

### Task 2: 左轮局部枪击舞台（GREEN）

**Files:**
- Modify: `src/overlay/three-family-weapon-firearm.ts`
- Modify: `src-tauri/materials/revolver/revolver.svg`

- [ ] **Step 1: 增加枪械身份几何**

创建稳定命名的 `revolver-bullet`、`revolver-impact-ring`、`revolver-impact-spark-*`，使用现有 `physicalMaterial` / `additiveMaterial`；枪口火焰保留在枪口局部坐标。

- [ ] **Step 2: 实现四段时间线**

使用 `clamp` 和 `easeOut` 计算枪口、子弹、弹壳与命中局部 progress。子弹沿 `ctx.direction` 前进，命中中心由枪口方向和 `bulletDistance` 参数决定；所有对象按 `fadeAt` 结束，不创建每帧临时几何。

- [ ] **Step 3: 精修 SVG 纹理**

保留 512 viewBox 与当前轮廓，补充枪口内膛暗部、弹巢槽高光、握把交叉防滑纹和局部磨损线，确保小尺寸轮廓优先。

- [ ] **Step 4: 运行左轮测试**

Run: `pnpm vitest run src/__tests__/three-weapon-stages.test.ts`

Expected: 左轮阶段断言通过。

---

### Task 3: 神龙身份舞台（GREEN）

**Files:**
- Modify: `src/overlay/three-family-natural-wave.ts`
- Modify: `src/overlay/material-style-living.ts`
- Modify: `src-tauri/materials/dragon/dragon.svg`

- [ ] **Step 1: 创建分节龙身与身份部件**

为头、分节、鳞片、背脊、龙须、龙珠和龙息创建稳定对象；每个分节沿已有 S 型路径定位，鳞片贴近对应分节，避免脱离素材形成无关背景。

- [ ] **Step 2: 实现头部领先与龙息**

以头部位置计算口部方向，龙息 beam 只在 `t >= 0.26` 从口部射出；龙珠以头部前方偏移和轻微摆动跟随，头部和龙身使用不同缩放表达透视。

- [ ] **Step 3: 增强 Canvas 降级配方**

把龙鳞从泛化多边形改成沿龙身方向的菱形/弧形片，龙息从运动方向发射，龙珠和爪痕限制在龙的局部路径范围内，粒子数量保持小于 180。

- [ ] **Step 4: 运行神龙与素材测试**

Run: `pnpm vitest run src/__tests__/three-dragon-stage.test.ts src/__tests__/material-styles.test.ts`

Expected: 神龙组件、方向与粒子预算断言通过。

---

### Task 4: 收敛共用全屏场（GREEN）

**Files:**
- Modify: `src/overlay/three-full-field-spectacle.ts`
- Modify: `src/overlay/three-effect-layers.ts`

- [ ] **Step 1: 按素材/预设计算局部 reach**

对于 `gunshot`、`wave` 等已有专属舞台的预设，将 `reach` 限制到 origin 周边 220-360px，`field` alpha 降到仅作材质轮廓辅助；保留明确空间类预设的完整场景。

- [ ] **Step 2: 让共用层可关闭**

在 `FamilyContext` 增加可选 `localized` 或通过 `packId`/profile 解析策略，保证专舞台可将 field 与全屏 rings 置零而不影响 generic legacy preset。

- [ ] **Step 3: 运行场景回归测试**

Run: `pnpm vitest run src/__tests__/three-full-field-spectacle.test.ts src/__tests__/three-effect-contract.test.ts`

Expected: 局部化断言通过，所有预设仍有完整 render contract。

---

### Task 5: 全量验证与视觉检查

**Files:**
- Modify: `docs/material-icons-summary.md`（仅在需要时补充本轮结果）

- [ ] **Step 1: 运行类型检查**

Run: `pnpm typecheck`

Expected: exit code 0。

- [ ] **Step 2: 运行完整测试**

Run: `pnpm test`

Expected: Vitest exit code 0，失败数为 0。

- [ ] **Step 3: 运行生产构建**

Run: `pnpm build`

Expected: TypeScript 与 Vite 构建均 exit code 0。

- [ ] **Step 4: 检查 SVG 与工作区差异**

Run: `rg -n '<svg|viewBox|stroke-width' src-tauri/materials/revolver/revolver.svg src-tauri/materials/dragon/dragon.svg; git diff --stat`

Expected: SVG 有标准 viewBox，工作区只包含本轮及此前用户已有的相关改动。

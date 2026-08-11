# 性能规则

## 硬性预算（违反则 CI 失败）

| 指标 | 上限 | 测量方法 |
|---|---|---|
| 应用启动到托盘可见 | 500ms | E2E：记录 `app.ready` 到 tray 出现时间差 |
| 快捷键到覆盖层首帧 | 150ms | Rust：`Instant` 测量从 shortcut handler 到 `window.show()` |
| 物理循环单帧耗时 | 2ms | Vitest benchmark：`physics.step()` 1000 次取 P99 |
| 安装包体积 | 15MB | `cargo tauri build` 产物大小 CI 检查 |
| 空闲 RSS | 50MB | E2E 启动后 5s 采样 |

## 物理引擎性能规则

### R-PERF-001：固定时间步长
物理更新使用 `dt = 1/60`，不与 `requestAnimationFrame` 的实际间隔耦合。
```typescript
// ✅ 正确
const DT = 1 / 60;
function loop() {
  physicsStep(state, DT);
  renderFrame(state);
  requestAnimationFrame(loop);
}

// ❌ 禁止
function loop(timestamp: number) {
  const dt = (timestamp - lastTime) / 1000;
  physicsStep(state, dt); // dt 不确定，结果不可重现
}
```

### R-PERF-002：脏区域渲染
Canvas 清除只清除鞭子的包围盒 + 安全边距，不清除整个 canvas：
```typescript
function clearDirtyRegion(ctx: CanvasRenderingContext2D, whip: WhipState) {
  const bbox = computeBoundingBox(whip.pts);
  ctx.clearRect(
    bbox.x - MARGIN, bbox.y - MARGIN,
    bbox.w + MARGIN * 2, bbox.h + MARGIN * 2
  );
}
```

### R-PERF-003：背景填充最小化
透明窗口捕获鼠标事件的 `bgAlpha` 填充只在必要时执行（Windows 需要，macOS 可跳过）。

## 启动性能规则

### R-PERF-004：懒加载 settings 窗口
settings 窗口在用户明确请求前不创建（不预加载）。
overlay 窗口在首次触发前预创建但隐藏（提前加载 WebView 资产）。

### R-PERF-005：皮肤懒加载
启动时只加载活跃皮肤的 manifest，不预加载所有皮肤的音频文件。
音频在首次 crack 前通过 `new Audio(url).load()` 提前解码（非阻塞）。

## 内存规则

### R-PERF-006：覆盖层隐藏时释放 canvas 资源
overlay 窗口隐藏时调用 `ctx.clearRect(0, 0, W, H)` 并将 `whip = null`，
释放物理状态和渲染缓存。不销毁窗口本身（避免重建 WebView 开销）。

## 包体积规则

### R-PERF-007：不打包未使用皮肤音效
打包时检查每个内置皮肤 manifest 中声明的音效文件是否全部存在，
如有声明但文件不存在，构建失败（防止遗漏资产导致运行时 404）。

### R-PERF-008：前端代码分割
overlay 页面和 settings 页面各自独立入口，不共享 bundle。
两个 WebView 不需要加载对方的代码。

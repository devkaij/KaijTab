# KaijTab 模块开发指南

一个模块 = `src/modules/<id>/` 一个目录，典型的三个文件：

```
modules/<id>/
  meta.ts      元数据 + load()，注册表静态引入（必须保持轻量，不要 import 组件）
  index.tsx    模块组件，只有画布上存在实例时才会被动态 import
  <id>.css     模块样式（会被打进模块自己的 chunk，按需加载）
```

## 契约

- `meta.ts` 默认导出 `satisfies ModuleDefinition`（类型见 `src/newtab/module-host/types.ts`）
- 组件签名 `({ instanceId, props, updateProps, runtime }: ModuleProps)`
- `props` 是 `Record<string, unknown>`，**模块自己负责兜默认值**（`meta.defaultProps` 只在新实例创建时使用）

## 硬性规则

1. **禁止访问 `chrome.*` 或 `localStorage`**：一律走 `runtime`（为将来的沙箱化留路）
   - 实例私有数据 → `runtime.data`
   - 模块级设置（跨实例，如 API key）→ `runtime.settings`
2. **禁止写死颜色**：只用 CSS 变量（`--kt-fg`、`--kt-surface`、`--kt-accent` …，见 `styles/theme.css`）
3. **尺寸必须声明**：`defaultSize` 必填，建议给 `minSize`；需要锁宽高比时设 `aspectLocked`
4. **必须响应可见性**：定时器类模块用 `runtime.visibility.onChange` 在页面隐藏时停表
5. **不要引入大型依赖**：模块 chunk 大小直接影响首次放置该模块时的加载速度

## 创建新模块

```bash
pnpm new:module my-widget
```

然后：

1. 编辑 `src/modules/my-widget/meta.ts`（名称、图标、尺寸、defaultProps、settingsSchema）
2. 编辑 `src/modules/my-widget/index.tsx` 实现组件
3. `pnpm build`，在画布上进入编辑态 → 模块 → 找到它 → 添加

参考实现：`src/modules/clock/`（覆盖了动态加载、props、settingsSchema、runtime.visibility、按需 CSS 的完整用法）。

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

## 尺寸自适应（重要）

宿主在元件根节点上开了尺寸容器（`container-type: size`），所以模块内部**直接用容器查询单位**写尺寸，就能随元件大小自动缩放：

```css
.kt-my-widget .title {
  /* 基准：默认尺寸下的期望值，再夹一个上下限 */
  font-size: clamp(12px, min(4cqw, 10cqh), 48px);
}
.kt-my-widget { gap: clamp(2px, 3cqh, 18px); padding: clamp(6px, 2cqw, 24px); }
```

- `cqw` = 元件宽度的 1%，`cqh` = 高度的 1%
- 用 `min(a cqw, b cqh)` 可以避免"扁元件/窄元件"下比例失真，外层再套 `clamp()` 设上下限
- 参考实现：`src/modules/clock/clock.css`

## 卡片与玻璃质感

不要在模块里写死卡片背景。用宿主提供的令牌，这样全局的「无 / 磨砂玻璃 / 液态玻璃」切换才会生效：

```css
.kt-my-widget {
  background: var(--kt-card-bg);          /* 无玻璃时是深色半透明；玻璃模式下自动透明 */
  border: var(--kt-card-border);
  border-radius: var(--kt-radius);
  backdrop-filter: var(--kt-card-blur);
  box-shadow: var(--kt-card-shadow);
}
```

玻璃模式下由宿主在元件表面统一绘制效果，模块卡片自动透明，不需要模块做任何事。

## 敏感数据与宿主数据

- **API Key / 令牌等敏感信息**：用 `runtime.secrets`（模块级、只写本地、**永不参与账号同步**）
  ```ts
  runtime.secrets.set("apiKey", value);
  const key = runtime.secrets.get<string>("apiKey");
  ```
- **非敏感配置**（接口地址、模型名等）：用 `runtime.settings`（随设置一起跨设备同步）
- **只读的应用数据**：`runtime.app.shortcuts()` 可拿到用户的快捷方式列表（标题 + URL），不需要自己访问 `chrome.*`
- **要用大模型能力**（翻译、分类、摘要…）：用共享的 `runtime.ai`，不要自己拼请求
  ```ts
  runtime.ai.configured(); // 用户配过 AI 接口吗（没配就提示去配）
  const text = await runtime.ai.chat(
    [
      { role: "system", content: "你是翻译引擎…" },
      { role: "user", content: JSON.stringify(titles) },
    ],
    { maxTokens: 1200, temperature: 0.2 },
  );
  ```
  低思考档位字段、接口 400 自动降级、超时与中止都由宿主统一处理；配置界面复用 `@/newtab/core/ai/AiConfigForm`（`hot-list` 模块是完整例子：未配置时弹层里嵌这个表单，保存后自动开始）
- 若模块必须使用浏览器 API（例如书签、历史记录），请在模块 README 里写明原因与所需权限

## 创建新模块

```bash
pnpm new:module my-widget
```

然后：

1. 编辑 `src/modules/my-widget/meta.ts`（名称、图标、尺寸、defaultProps、settingsSchema）
2. 编辑 `src/modules/my-widget/index.tsx` 实现组件
3. `pnpm build`，在画布上进入编辑态 → 模块 → 找到它 → 添加

参考实现：`src/modules/clock/`（覆盖了动态加载、props、settingsSchema、runtime.visibility、按需 CSS 的完整用法）。

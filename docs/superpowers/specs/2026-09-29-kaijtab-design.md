# KaijTab 设计文档

- 日期：2026-09-29
- 状态：已确认（设计讨论通过，spec 自审后直接进入实施）
- 项目路径：`D:\code\KaijTab`
- 目标形态：Chrome / Edge 的 MV3 扩展，纯自用，不上架

---

## 1. 背景与目标

对标 SuperTab 新标签页，但走相反的产品哲学：

| 维度 | SuperTab | KaijTab |
|---|---|---|
| 布局 | 固定排版 + 少量自定义 | **自由画布**：任意拖放、缩放、叠放 |
| 功能 | 内置一大票功能 | **极简内核**，功能全部走模块中心按需启用 |
| 壁纸 | 在线壁纸库 | **本地导入 Wallpaper Engine 视频壁纸**（OPFS 拷贝） |
| 数据 | 自建账号云同步 | 本地存储 + 浏览器账号可选同步，零服务端 |

成功标准（自用视角）：

1. 当作日常默认新标签页使用一周不别扭；
2. 拖拽/缩放在中端机器上稳定 60fps；
3. 空画布冷启动到可交互 < 100ms（本机）；
4. 新增一个模块从 `pnpm new:module` 到画布可见 ≤ 30 分钟。

## 2. 范围

### v1 范围内

- 核心底座：自由画布布局引擎、静态/动态壁纸、搜索框、网站快捷方式
- 模块机制：注册表、按需加载、错误边界、模块中心、`runtime` API、脚手架脚本
- 验证模块：时钟（同时作为新模块模板）
- 动态壁纸：从 Wallpaper Engine 工坊目录或任意位置导入 `.mp4/.webm`，拷贝进 OPFS 播放
- 存储：`chrome.storage.local` + 可选 `chrome.storage.sync`（仅小配置）
- 测试：Vitest 单测 + Playwright 扩展 E2E + 人工验收清单

### v1 范围外（明确不做）

- 天气、热榜、便签、倒计时等一切业务模块
- 自建账号、云同步服务、任何服务端
- 第三方模块生态 / iframe 沙箱（接口上预留，不实现）
- 视频转码（不内置 ffmpeg.wasm）
- Firefox 兼容、商店上架合规、i18n（先写死中文）

## 3. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 扩展规范 | Manifest V3 | 现行标准 |
| 构建 | Vite + `@preact/preset-vite` + `vite-plugin-web-extension` | MV3 清单处理 + Dev HMR；多入口与动态 import 分包开箱即用 |
| UI | Preact + `@preact/signals` | ~4KB 运行时，启动速度优先；信号避免全局重渲染 |
| 语言 | TypeScript strict | 数据模型和迁移必须类型化 |
| 样式 | CSS Modules + CSS 变量主题令牌 | 零运行时；模块只允许使用主题变量 |
| 存储 | chrome.storage + OPFS | 见第 5 节 |
| 测试 | Vitest（纯逻辑）+ Playwright（E2E 加载真实扩展） | 手感类逻辑尽量下沉为纯函数 |

## 4. 架构总览

```
┌─ background/service worker ── 只在安装时初始化 + 触发 schema 迁移，常驻逻辑为零
│
├─ newtab (main.html) ─────────────────────────────────┐
│   ├─ canvas/     布局引擎（拖拽、缩放、吸附、选择、撤销栈、渲染）  │
│   ├─ core/       搜索、快捷方式、壁纸渲染层                     │
│   ├─ module-host/ 注册表、加载器、错误边界、模块中心 UI          │
│   ├─ editor/     编辑态：工具栏、壁纸面板、设置                  │
│   └─ styles/     主题令牌                                    │
├─ modules/clock/  模块目录（独立 chunk，按需 import）           │
└─ shared/         存储层、迁移、runtime API、类型、工具          │
```

两条硬规则：

1. **模块代码以"画布上存在该模块的实例"为唯一加载条件。** 注册表静态引入的只有 `meta.ts`（元数据，几 KB）；组件通过 `load()` 动态 import。
2. **核心底座不走模块体系。** 壁纸/搜索/快捷方式/布局引擎是地基，避免循环依赖。

## 5. 数据模型与存储

### 5.1 三层存储

| 层 | 内容 | 说明 |
|---|---|---|
| `chrome.storage.local` | 布局、快捷方式、设置、模块启用列表、壁纸库索引、模块私有数据 | 配 `unlimitedStorage`；不含视频文件 |
| `chrome.storage.sync`（可选开启） | 布局 + 快捷方式 + 设置 + 模块启用列表的快照 | 配额 100KB / 单项 8KB，按 7KB 分块存为 `sync:*:0/1/2…`；超配额拒绝并提示，不静默截断 |
| OPFS | 壁纸视频原文（`wallpapers/<id>.ext`）+ 缩略图（`thumbs/<id>.jpg`） | 大文件用文件语义；页面隐藏暂停播放后不占内存 |

同步三个约束：壁纸文件永不上云；布局引用壁纸 **id 而非路径**，跨设备缺失该壁纸时降级默认壁纸 + 轻提示；模块私有数据默认只存本地不同步。

### 5.2 顶层结构

```ts
interface RootState {
  schemaVersion: number;              // 当前为 1
  layout: {
    base: { w: number; h: number };   // 首次编辑时记录，仅用于新元件默认落点与未来迁移
    items: WidgetInstance[];
  };
  shortcuts: { groups: ShortcutGroup[]; items: Shortcut[] };
  modules: {
    enabled: string[];                // 模块中心里"我的模块"
    settings: Record<string, unknown>;// 模块级设置（如未来的 API key）
  };
  moduleData: Record<string, unknown>; // 键为 `模块id:实例id`，模块私有数据
  wallpaperLibrary: WallpaperRecord[];
  wallpaperCurrent: string | null;    // 壁纸 id
  settings: {
    searchEngine: "bing" | "baidu" | "google";
    pauseWhenHidden: boolean;
    playOnlyWhenFocused: boolean;
    dimWallpaperInEditor: boolean;
    editorPrefs: { grid: number | null; snapThreshold: number };
  };
}

interface WidgetInstance {
  id: string;                          // "inst_xxx"
  type: string;                        // 模块 id
  x: number; y: number;                // 归一化坐标 0~1（相对视口）
  w: number; h: number;                // 像素尺寸
  z: number;                           // 叠放层级
  locked?: boolean;
  props: Record<string, unknown>;      // 实例级配置
}

interface WallpaperRecord {
  id: string;                          // "wp_xxx"
  kind: "video" | "image";
  name: string;
  file: string;                        // OPFS 路径 "wallpapers/wp_xxx.webm"
  thumb: string;                       // OPFS 路径 "thumbs/wp_xxx.jpg"
  size: number; duration?: number;     // 字节 / 秒
  addedAt: number;
  source: "we" | "file";
}
```

### 5.3 关键决策

1. **坐标模型：位置归一化（0~1）+ 尺寸 px。** 渲染位置 = `x × 当前视口宽`，窗口缩放自动跟随；溢出时钳制进可视区但**不改写存储值**，窗口恢复后自动回位。尺寸用 px 保证文字始终清晰。
2. **版本化迁移从第一天就有。** `schemaVersion` + 链式 `migrate_N_to_M`，加载时逐个执行。
3. **快捷方式图标**：优先 `_favicon` API（`favicon` 权限）→ 站点 `/favicon.ico` → 首字母色块；允许手动上传图标（存 OPFS `icons/`）。

## 6. 布局引擎

### 6.1 双模态

- **展示态**（默认）：无手柄、无网格；模块内容正常交互；右上角悬停出现"编辑布局"齿轮
- **编辑态**：元件挂拖拽区、出现参考线；工具栏（添加模块 / 壁纸 / 设置 / 退出）；壁纸默认变暗 15%
- 冲突规避：编辑态下模块内容容器 `pointer-events: none`，由外壳接管指针

### 6.2 拖拽与缩放

- Pointer Events；拖拽期间只改 `transform: translate3d`（直接操作 DOM style，不触发重渲染），pointerup 提交时写入存储
- **吸附**：阈值 6px；参考线来源 = 画布四边 + 水平/垂直中线 + 其他元件的边与中心；画在独立 SVG 覆盖层；按住 **Alt 临时关闭吸附**
- **缩放**：8 个手柄；模块声明 `minSize / maxSize / aspectLocked`，越界钳制
- **碰撞：允许重叠**；点击自动置顶 + 右键"置顶/置底"，不做自动避让

### 6.3 编辑操作

- 方向键微移 1px，Shift+方向键 10px；Delete 删除（一次确认）
- 右键菜单：置顶 / 置底 / 锁定 / 复制 / 删除
- **撤销/重做**：每次提交操作前压入布局 JSON 快照，栈上限 50，Ctrl+Z / Ctrl+Shift+Z
- 锁定：锁定后编辑态不可拖动，但内容可交互（为将来的播放器/便签准备）
- 多选（框选 + Shift 点选）与六向对齐、等距分布：**可延后项**，实现超期先砍

### 6.4 层级

- `z` 为整数；点击选中即 `z = max + 1`；右键可置顶/置底

## 7. 壁纸管线

### 7.1 导入

两个入口：

1. 选文件：`<input type="file" multiple>`，接受 `video/mp4,video/webm,image/*`
2. 选文件夹：`showDirectoryPicker()` 指向 WE 工坊目录 `steamapps/workshop/content/431960/`，扫描各壁纸子目录内的 `.mp4/.webm` 批量列表

单个文件流水线：

```
校验（容器/可播性 canPlayType + metadata 探测 + 体积 + 分辨率）
  → file.stream() → OPFS writable 流式拷贝（进度条；失败清理半成品）
  → 缩略图：优先 WE 自带 preview.jpg；否则 canvas 抽 0.1s 首帧
  → 写 wallpaperLibrary 索引
```

边界规则：

- 同名 + 同体积 → 提示"疑似已导入过"
- > 300MB 性能提示；> 500MB 建议放弃
- 导入前 `navigator.storage.estimate()` 检查配额，不足即拒绝
- 部分失败不阻塞整体，逐条给原因
- **不做转码**，只做兼容性校验与提示

### 7.2 播放

- 静态/动态统一模型，切换 300ms 淡入淡出
- `<video muted loop autoplay playsInline>` + `poster` = 缩略图，避免闪白
- `document.hidden` 暂停 / 恢复（默认开）；可选"仅窗口聚焦时播放"
- 可选：电量 <20% 且未充电时暂停并提示（`getBattery`）
- 超出屏幕分辨率交给 CSS 缩放走硬件加速

### 7.3 管理

- 缩略图网格（名称 / 时长 / 体积），操作：应用 / 删除 / 导出到本地
- 删除同步清理 OPFS 两文件 + 索引；使用中的壁纸需先切换
- 设置页显示"壁纸占用 XX MB"
- 孤儿文件检测：可选项
- 内置 1~2 张纯 CSS 渐变默认壁纸，首次启动不白屏

### 7.4 权限

必需：`storage`、`unlimitedStorage`、`favicon`（图标）、`search`（搜索 API）。导入 OPPFS 无需额外权限。

## 8. 模块机制

### 8.1 契约

```
modules/<id>/
  meta.ts     ← 极轻元数据，注册表静态引入
  index.tsx   ← 组件，动态 import
```

```ts
export default {
  id, name, icon, category,
  defaultSize, minSize?, maxSize?, aspectLocked?,
  defaultProps,
  load: () => import("./index"),
  settingsSchema: FieldSchema[],   // 自动生成配置面板
} satisfies ModuleDefinition;

function Module({ instanceId, props, updateProps, runtime }: ModuleProps<P>) { … }
```

`runtime` 注入能力（模块禁止直接访问 `chrome.*`）：

- `runtime.data`：按 `模块id:实例id` 命名空间的私有数据读写（默认不同步）
- `runtime.visibility`：页面可见性信号（后台降频/暂停）
- `runtime.theme`：CSS 变量主题令牌
- `runtime.settings`：模块级设置读写

### 8.2 加载三态

```
未启用/未放置 → 不加载代码
启用未放置   → 仅 meta 在内存；空闲预取 chunk
有实例       → 动态 import 组件
```

- 加载中显示等尺寸骨架；失败 → 实例级错误边界 + 重试，不影响整页
- 移除最后实例不卸载 chunk

### 8.3 模块中心

- 分区：我的模块（已启用）｜可用模块（点 + 启用）
- 卡片：图标 / 名称 / 简介 / 尺寸标记；操作：启用、添加到画布、打开设置
- 添加落点：视口中心螺旋探测第一个不压住已有元件的位置
- 配置分层：实例级 `props`（settingsSchema 自动面板） vs 模块级 `modules.settings[id]`

### 8.4 验证模块与模板

- v1 唯一模块：**时钟**（纯本地、零网络），覆盖 meta 注册 → 动态加载 → props 面板 → 错误边界全链路
- `pnpm new:module <id>` 生成骨架；`modules/README.md` 一页规范

## 9. 工程结构

```
KaijTab/
├─ src/
│  ├─ background/index.ts
│  ├─ newtab/{ canvas/, core/, module-host/, editor/, styles/, main.html, main.tsx }
│  ├─ modules/clock/
│  ├─ shared/{ storage/, migrations/, runtime/, types/, utils/ }
│  └─ manifest.json
├─ scripts/new-module.mjs
├─ tests/{ unit/, e2e/ }
├─ docs/{ superpowers/specs/, manual-checklist.md }
├─ vite.config.ts
└─ package.json
```

约定：pnpm、TS strict、小步提交、`CHANGELOG.md` 记粗粒度变更。

## 10. 测试与验证

### 10.1 单测（Vitest，纯逻辑）

坐标归一化与钳制、吸附计算、撤销栈、schema 迁移链、同步分块重组。

### 10.2 E2E（Playwright 加载打包扩展，headed 模式）

拖拽 → storage 断言；缩放；撤销；增删模块全链路；模块启用 → 骨架 → 加载 → 渲染；故意抛错模块只影响自身；冷启动可交互时间。

### 10.3 人工清单 `docs/manual-checklist.md`

真实 WE 视频（大文件 / 超宽 / 异常编码）、拖拽手感与 Alt 关闭吸附、窗口缩放表现、后台暂停时的 CPU/GPU、10+ 元件流畅度。

### 10.4 性能预算

| 指标 | 预算 |
|---|---|
| 核心初始 chunk（gzip） | < 80 KB |
| 空画布冷启动到可交互 | < 100 ms（本机） |
| 拖拽帧率 | 稳定 60fps |
| 无实例模块产生开销 | 0 |

## 11. 里程碑

| # | 里程碑 | 验收方式 |
|---|---|---|
| M0 | 脚手架：Vite+Preact+MV3 可加载，空白新标签页 | 手动加载 + `pnpm build` 通过 |
| M1 | 存储层：schema、迁移、local/sync 分块 | 单测通过 |
| M2 | 画布引擎：拖拽/缩放/吸附/撤销 | 单测 + E2E 拖拽用例 |
| M3 | 核心底座：搜索、快捷方式、默认壁纸 | E2E + 手动 |
| M4 | 壁纸管线：WE 导入、OPFS、播放策略 | E2E + 手动清单 |
| M5 | 模块机制 + 时钟模块 | E2E 模块全链路 |
| M6 | 收尾：性能预算核对、人工验收清单交付 | 预算表 + 截图 |

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| OPFS 大文件拷贝中断/配额不足 | 流式拷贝 + 进度 + 失败清理半成品；导入前 estimate 预检 |
| 视频编码不可播 | canPlayType + metadata 双校验，导入即提示 |
| 拖拽与模块内容交互冲突 | 编辑态 `pointer-events: none` + 锁定机制 |
| 极端窗口比例下钳制行为不符合直觉 | 纯函数单测覆盖，含超宽/超窄用例 |
| 拖拽高频更新导致卡顿 | 拖拽期间直接操作 DOM transform，不进渲染循环 |
| vite-plugin-web-extension 兼容性 | 必要时退回"手写 manifest + vite build + 复制静态资源" |

# KaijTab 实施计划

- 日期：2026-09-29
- 依据：`docs/superpowers/specs/2026-09-29-kaijtab-design.md`
- 执行方式：主模型逐里程碑实现，每个里程碑跑通对应验证后进入下一个；全部完成后交付人工验收

## 施工顺序与验收标准

### M0 脚手架（可加载的空白新标签页）

任务：
- [x] git 仓库初始化、spec 提交
- [x] `package.json` / `tsconfig` / `vite.config.ts`（多入口：main.html + background，手写 manifest 方案，不引入 web-extension 插件）
- [x] `public/manifest.json`（MV3，权限仅 storage / unlimitedStorage / favicon）
- [x] 新标签页骨架 `src/newtab/main.html|main.tsx`，渲染一句可见文本
- [x] `pnpm build` 通过，`dist/` 结构正确（main.html、background.js、assets/）

验收：`pnpm build` 退出码 0；`dist/manifest.json` 路径与产物一致。

### M1 存储层

任务：
- [x] `shared/types.ts`：RootState / WidgetInstance / WallpaperRecord 等
- [x] `shared/storage/state.ts`：默认状态、加载（含迁移）、保存（防抖）
- [x] `shared/storage/sync.ts`：7KB 分块 + 重组 + 配额拒绝
- [x] `shared/migrations/index.ts`：链式迁移框架（v1 起步，含 no-op 用例）
- [x] 单测：迁移链、分块重组、默认值与深合并

验收：`pnpm test` 全绿。

### M2 画布引擎

任务：
- [x] `canvas/geometry.ts`：归一化换算、溢出钳制（纯函数）
- [x] `canvas/snapping.ts`：吸附与参考线计算（纯函数）
- [x] `canvas/history.ts`：撤销/重做快照栈
- [x] `canvas/useDrag.ts` + `canvas/useResize.ts`：Pointer Events，拖拽期直接改 DOM transform
- [x] `canvas/Canvas.tsx`：渲染层、编辑/展示双态、SVG 参考线覆盖层
- [x] 选择、点击置顶、右键菜单、键盘微移、Delete、锁定
- [x] 单测：geometry / snapping / history；E2E：拖拽 → storage 断言、撤销

验收：单测全绿；E2E 拖拽用例通过；手工拖拽 60fps。

### M3 核心底座

任务：
- [x] `core/Search.tsx`：多引擎切换 + 回车搜
- [x] `core/Shortcuts.tsx`：网格、添加/编辑/删除、favicon 回退链
- [x] 默认渐变壁纸（纯 CSS），首次启动不白屏

验收：E2E 添加快捷方式并持久化；搜索跳转 URL 正确。

### M4 壁纸管线

任务：
- [x] `core/wallpaper/opfs.ts`：写入/读取/删除/列举、配额预检
- [x] 导入流水线：文件 + 文件夹（WE 工坊）→ 校验 → 流式拷贝（进度）→ 缩略图 → 索引
- [x] 播放层：video 元素 + poster + 淡入淡出 + 可见性暂停
- [x] 管理面板：网格、应用、删除、导出、占用统计

验收：E2E 导入小视频（fixture 生成）→ 应用 → 刷新后仍在；手动过真实 WE 视频。

### M5 模块机制

任务：
- [x] `module-host/registry.ts`：meta 静态注册 + load 动态 import
- [x] `module-host/ModuleHost.tsx`：骨架、实例级错误边界、重试
- [x] `module-host/runtime.ts`：data / visibility / theme / settings
- [x] 模块中心 UI：我的模块 / 可用模块 / 添加到画布（螺旋探测落点）
- [x] `modules/clock/`：验证模块兼模板
- [x] `scripts/new-module.mjs` + `modules/README.md`

验收：E2E 启用 → 添加 → 骨架 → 渲染；抛错模块仅自身失败。

### M6 收尾

任务：
- [x] 性能预算核对（核心 chunk < 80KB gzip、冷启动 < 100ms）
- [x] `docs/manual-checklist.md` 人工验收清单
- [x] README（加载方式、开发命令、模块开发指南）
- [x] 截图交付 + CHANGELOG

验收：预算核对表 + 人工清单就绪，交用户手动验收。

## 技术决定（与 spec 的差异记录）

1. **不引入 `vite-plugin-web-extension`**：改用"手写 manifest + Vite 多入口"，去掉一个兼容性风险源；代价是没有 Dev HMR，用 `pnpm build --watch` + 扩展重载代替。
2. **不加 `search` 权限**：搜索走 URL 模板拼接，不需要 `chrome.search`。最终权限 = `storage` / `unlimitedStorage` / `favicon`。
3. **v1 不做多选对齐**（spec 已标注可延后），先保证单件拖拽手感。

## 完成情况（2026-09-29）

- M0–M6 全部完成：38 单测 + 21 E2E 全绿，冷启动 51–68ms（预算 <100ms），核心 chunk gzip ≈25KB（预算 <80KB）
- 额外完成：真实视频导入/播放/可见性暂停的 E2E、浏览器账号同步 UI 接线、演示截图脚本（scripts/screenshots.mjs）
- 交付物：dist/ 可加载扩展、README、CHANGELOG、docs/manual-checklist.md、docs/screenshots/


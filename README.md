# KaijTab

自由画布式新标签页扩展：**任意拖放布局**、**导入 Wallpaper Engine 动态壁纸**、**模块按需加载**、零服务端。

- 技术：Manifest V3 + Vite + Preact + TypeScript
- 数据：本地存储 + 可选的浏览器账号同步（壁纸与模块私有数据永不上云）
- 定位：自用，不上架

![展示态](docs/screenshots/05-view-wallpaper.png)

## 快速开始

```bash
pnpm install
pnpm build          # 产物在 dist/
```

加载到浏览器：

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 打开右上角"开发者模式"
3. 点"加载已解压的扩展程序"，选择本项目的 `dist` 目录
4. 新开一个标签页即可看到 KaijTab

> 修改代码后重新 `pnpm build`，回到扩展页点一次"刷新"按钮即可生效（开发时可用 `pnpm dev` 进入 watch 构建）。

## 功能

| 能力 | 说明 |
|---|---|
| 自由画布 | 任意拖放/八向缩放/允许重叠/点击置顶；拖拽时自动吸附（Alt 临时关闭）；方向键微调；撤销/重做（50 步）；右键菜单置顶/置底/复制/锁定/删除/设置 |
| 外观 | **玻璃质感**三档切换：无 / 磨砂玻璃 / 液态玻璃（全局默认 + 单元件覆盖）；**元件内容随尺寸自适应**（容器查询单位，时钟文字、搜索框、图标全部按比例缩放） |
| 动态壁纸 | 导入本地 `.mp4/.webm` 或图片；或直接把 Wallpaper Engine 工坊目录（`steamapps/workshop/content/431960/`）批量导入；拷贝进 OPFS 后与原文件解耦；页面隐藏自动暂停；支持导出与占用统计 |
| 核心底座 | 搜索框（Bing/百度/Google 一键切换，输入网址直接跳转）、快捷方式（**网站图标自动获取**，失败回退首字母，可手填图标地址） |
| 模块中心 | 默认极简，功能以模块形式按需启用；模块代码只在画布上存在实例时才加载（独立 chunk，含 CSS） |
| 账号同步 | 可选开启；布局/快捷方式/设置走 `chrome.storage.sync` 分块同步；超配额自动关闭并提示 |

## 测试

```bash
pnpm test           # 单元测试（坐标/吸附/撤销栈/迁移/同步分块）
pnpm build && pnpm exec playwright test   # E2E：加载真实扩展跑全链路
node scripts/screenshots.mjs              # 生成 docs/screenshots/
pnpm new:module <id>                      # 生成新模块骨架
```

当前覆盖：**38 单测 + 21 E2E**；冷启动到可交互约 **50–70ms**，核心 chunk gzip **≈25KB**。

## 项目结构

```
src/
├─ background/          service worker（只做安装初始化，常驻逻辑为零）
├─ newtab/
│  ├─ canvas/           布局引擎：geometry / snapping / history（纯函数，有单测）+ 组件
│  ├─ core/             核心底座：搜索 / 快捷方式 / 壁纸（OPFS、导入、播放、面板）
│  ├─ module-host/      模块宿主：注册表 / 按需加载 / 错误边界 / runtime / 模块中心 / 实例设置
│  ├─ editor/           编辑态工具栏
│  ├─ ui/               全局提示
│  └─ styles/           主题令牌与样式
├─ modules/             模块目录（每个模块独立 chunk）
│  └─ clock/            参考实现 + 模板
└─ shared/              类型 / 存储 / 迁移 / 工具
docs/
├─ superpowers/specs/   设计文档
├─ superpowers/plans/   实施计划
├─ manual-checklist.md  人工验收清单
└─ screenshots/
```

## 模块开发

见 `src/modules/README.md`。一句话版本：复制 `src/modules/clock/`，或 `pnpm new:module <id>` 生成骨架，改 `meta.ts` + `index.tsx` 即可。

硬性规则：模块禁止直接访问 `chrome.*`（走 `runtime`）、禁止写死颜色（用 CSS 变量）、必须声明尺寸约束、定时器要响应 `runtime.visibility`。

## 已知限制

- 只支持 Wallpaper Engine 的**视频类**壁纸（`.mp4/.webm`）；场景类（`scene.pkg`）不做
- 不内置转码：编码不受支持的视频会在导入时被拒绝并提示
- 壁纸不上云：换设备需要重新导入（布局会同步，壁纸缺失时自动回落默认背景）
- 跨设备同步依赖浏览器的账号同步通道，超出配额（100KB）会自动关闭同步
- 网站图标按「站点 `/favicon.ico` → `apple-touch-icon.png` → `favicon.png` → 首字母」取；若站点图标走了非标准路径（只写在 HTML `<link rel="icon">` 里的），请在该快捷方式的编辑弹窗里手动填图标地址
- 未做：多选对齐、分组管理、i18n、Firefox

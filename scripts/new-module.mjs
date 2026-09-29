#!/usr/bin/env node
/**
 * 模块脚手架：node scripts/new-module.mjs <id>
 * 生成 src/modules/<id>/{meta.ts, index.tsx, <id>.css}
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error("用法：pnpm new:module <id>（小写字母开头，只含小写字母、数字和连字符）");
  process.exit(1);
}

const dir = resolve(import.meta.dirname, "..", "src", "modules", id);

try {
  await access(dir);
  console.error(`目录已存在：${dir}`);
  process.exit(1);
} catch {
  // 不存在，继续
}

await mkdir(dir, { recursive: true });

const className = `kt-${id}`;
const componentName = id
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join("");

await writeFile(
  resolve(dir, "meta.ts"),
  `import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "${id}",
  name: "${id}",
  description: "（一句话说明这个模块做什么）",
  icon: \`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"/></svg>\`,
  category: "工具",
  defaultSize: { w: 320, h: 180 },
  minSize: { w: 160, h: 100 },
  defaultProps: { title: "Hello" },
  settingsSchema: [{ key: "title", label: "标题", type: "text" }],
  load: () => import("./index"),
} satisfies ModuleDefinition;
`,
  "utf8",
);

await writeFile(
  resolve(dir, "index.tsx"),
  `import type { ModuleProps } from "@/newtab/module-host/types";
import "./${id}.css";

export default function ${componentName}({ props, updateProps, runtime }: ModuleProps) {
  void updateProps;
  void runtime;
  const title = typeof props.title === "string" ? props.title : "Hello";

  return (
    <div class="${className}">
      <span>{title}</span>
    </div>
  );
}
`,
  "utf8",
);

await writeFile(
  resolve(dir, `${id}.css`),
  `.${className} {
  display: grid;
  place-content: center;
  height: 100%;
  color: var(--kt-fg);
  background: var(--kt-surface);
  border: 1px solid var(--kt-border);
  border-radius: var(--kt-radius);
}
`,
  "utf8",
);

console.log(`已创建模块 src/modules/${id}/，编辑 meta.ts 与 index.tsx 后运行 pnpm build`);

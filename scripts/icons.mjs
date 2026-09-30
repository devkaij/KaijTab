#!/usr/bin/env node
/**
 * 生成扩展/PWA 图标：node scripts/icons.mjs
 * 产物：public/icons/icon{16,32,48,128}.png
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const out = resolve(import.meta.dirname, "..", "public", "icons");
await mkdir(out, { recursive: true });

const SIZES = [16, 32, 48, 128, 192, 512];

function svg(size) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style></head>
<body>
<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="28" fill="#0d1117"/>
  <rect x="12" y="12" width="47" height="47" rx="13" fill="#58a6ff"/>
  <rect x="69" y="12" width="47" height="47" rx="13" fill="#1f6feb"/>
  <rect x="12" y="69" width="47" height="47" rx="13" fill="#1f6feb" opacity="0.7"/>
  <rect x="69" y="69" width="47" height="47" rx="13" fill="#58a6ff" opacity="0.45"/>
</svg>
</body></html>`;
}

const browser = await chromium.launch();
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size));
  await page.screenshot({
    path: resolve(out, `icon${size}.png`),
    omitBackground: true,
  });
  await page.close();
}
await browser.close();
console.log(`图标已生成：${out}`);

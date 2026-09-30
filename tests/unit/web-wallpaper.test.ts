import { describe, expect, it } from "vitest";
import {
  entriesFromFileList,
  findPreview,
  findWebEntry,
  validateWebProject,
  WEB_MAX_FILES,
  type WebEntry,
} from "@/newtab/core/wallpaper/web";
import { isSupported, kindOf } from "@/newtab/core/wallpaper/importer";

function fakeFile(name: string, size = 10): File {
  return { name, size, type: "" } as unknown as File;
}

function entry(path: string, size = 10): WebEntry {
  return { path, file: fakeFile(path.split("/").pop() ?? path, size) };
}

describe("entriesFromFileList", () => {
  it("去掉最外层文件夹名", () => {
    const files = [
      Object.assign(fakeFile("index.html"), { webkitRelativePath: "my-wallpaper/index.html" }),
      Object.assign(fakeFile("app.js"), { webkitRelativePath: "my-wallpaper/js/app.js" }),
    ];
    const entries = entriesFromFileList(files);
    expect(entries.map((e) => e.path)).toEqual(["index.html", "js/app.js"]);
  });

  it("没有 webkitRelativePath 时退回文件名", () => {
    const entries = entriesFromFileList([fakeFile("index.html")]);
    expect(entries[0]?.path).toBe("index.html");
  });
});

describe("findWebEntry", () => {
  it("优先 index.html（大小写不敏感）", () => {
    expect(findWebEntry([entry("Index.HTML"), entry("page.html")])).toBe("Index.HTML");
  });

  it("没有 index 时退回任意 html", () => {
    expect(findWebEntry([entry("a.txt"), entry("main.htm")])).toBe("main.htm");
  });

  it("没有 html 返回 null", () => {
    expect(findWebEntry([entry("a.js")])).toBeNull();
  });
});

describe("findPreview", () => {
  it("识别 preview 图（大小写不敏感）", () => {
    expect(findPreview([entry("assets/x.png"), entry("PREVIEW.JPG")])?.path).toBe("PREVIEW.JPG");
  });

  it("只在工程根目录匹配", () => {
    expect(findPreview([entry("assets/preview.png")])).toBeNull();
  });
});

describe("validateWebProject", () => {
  it("正常工程返回入口", () => {
    const result = validateWebProject([entry("index.html"), entry("style.css")]);
    expect(result).toEqual({ entry: "index.html" });
  });

  it("空目录 / 无入口 / 超量分别给出原因", () => {
    expect(validateWebProject([])).toEqual({ error: "文件夹是空的" });
    expect(validateWebProject([entry("readme.txt")])).toEqual({
      error: "工程里找不到入口 HTML（index.html）",
    });
    const many = Array.from({ length: WEB_MAX_FILES + 1 }, (_, i) => entry(`assets/${i}.js`));
    const manyResult = validateWebProject([entry("index.html"), ...many]);
    expect("error" in manyResult ? manyResult.error : "").toContain("文件数");
    const hugeResult = validateWebProject([entry("index.html"), entry("big.bin", 400 * 1024 * 1024)]);
    expect("error" in hugeResult ? hugeResult.error : "").toContain("体积");
  });
});

describe("格式放宽后的识别", () => {
  it("视频：常见容器都算支持", () => {
    for (const name of ["a.mp4", "a.webm", "a.mov", "a.mkv", "a.avi", "a.m4v", "a.ogv"]) {
      expect(isSupported(fakeFile(name)), name).toBe(true);
      expect(kindOf(fakeFile(name)), name).toBe("video");
    }
  });

  it("图片：含矢量与动图", () => {
    for (const name of ["a.png", "a.JPG", "a.webp", "a.gif", "a.avif", "a.svg", "a.bmp"]) {
      expect(isSupported(fakeFile(name)), name).toBe(true);
      expect(kindOf(fakeFile(name)), name).toBe("image");
    }
  });

  it("MIME 优先于扩展名", () => {
    const file = { name: "unknown.bin", size: 1, type: "video/mp4" } as File;
    expect(isSupported(file)).toBe(true);
    expect(kindOf(file)).toBe("video");
  });

  it("不认识的文件类型仍然拒绝", () => {
    expect(isSupported(fakeFile("readme.txt"))).toBe(false);
    expect(isSupported(fakeFile("archive.zip"))).toBe(false);
  });
});

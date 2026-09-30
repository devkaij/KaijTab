import { useEffect, useRef, useState } from "preact/hooks";
import { editing, state } from "@/newtab/store";
import type { WallpaperRecord } from "@/shared/types";
import { registerWhost, webWallpaperUrl } from "./web";
import { useObjectUrl } from "./useObjectUrl";

/** 网页壁纸：等虚拟文件服务就绪后，用 iframe 加载工程入口 */
function WebWallpaper({ record, dim }: { record: WallpaperRecord; dim: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const style = dim ? { filter: "brightness(0.82)" } : undefined;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void registerWhost().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        setError("虚拟文件服务注册失败，无法渲染网页壁纸（请重新加载扩展后重试）");
        setStatus("error");
        return;
      }
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [record.id]);

  if (status === "error") {
    return (
      <div class="kt-wallpaper kt-wallpaper-default" style={style} data-testid="wallpaper-web-error">
        <span class="kt-wallpaper-error-text">{error}</span>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div class="kt-wallpaper kt-wallpaper-default" style={style} data-testid="wallpaper-web-loading" />
    );
  }

  return (
    <div class="kt-wallpaper" style={style} data-testid="wallpaper-web">
      <iframe
        class="kt-wallpaper-media"
        src={webWallpaperUrl(record.id, record.entry ?? "index.html")}
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
        title="网页壁纸"
        data-testid="wallpaper-web-frame"
      />
    </div>
  );
}

/** 壁纸层：静态图 / 动态视频 / 网页工程 / 默认渐变；含后台暂停与编辑态变暗。 */
export function WallpaperLayer() {
  const current = state.value.wallpaperCurrent;
  const settings = state.value.settings;
  const record = state.value.wallpaperLibrary.find((w) => w.id === current) ?? null;

  const fileUrl = useObjectUrl(record?.file);
  const thumbUrl = useObjectUrl(record?.thumb);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dim = editing.value && settings.dimWallpaperInEditor;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      const shouldPause =
        (document.hidden && settings.pauseWhenHidden) ||
        (settings.playOnlyWhenFocused && !document.hasFocus());
      if (shouldPause) {
        video.pause();
      } else {
        void video.play().catch(() => undefined);
      }
    };

    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, [fileUrl, settings.pauseWhenHidden, settings.playOnlyWhenFocused]);

  const style = dim ? { filter: "brightness(0.82)" } : undefined;

  if (!record) {
    return (
      <div class="kt-wallpaper kt-wallpaper-default" style={style} data-testid="wallpaper-default" />
    );
  }

  if (record.kind === "web") {
    return <WebWallpaper record={record} dim={dim} />;
  }

  if (record.kind === "image") {
    return (
      <div class="kt-wallpaper" style={style} data-testid="wallpaper-image">
        {fileUrl ? <img class="kt-wallpaper-media kt-fade-in" src={fileUrl} alt="" /> : null}
      </div>
    );
  }

  return (
    <div class="kt-wallpaper" style={style} data-testid="wallpaper-video">
      {fileUrl ? (
        <video
          ref={videoRef}
          class="kt-wallpaper-media kt-fade-in"
          src={fileUrl}
          poster={thumbUrl ?? undefined}
          muted
          loop
          autoplay
          playsInline
          disablePictureInPicture
          data-testid="wallpaper-video-el"
        />
      ) : null}
    </div>
  );
}

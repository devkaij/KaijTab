import { useEffect, useRef } from "preact/hooks";
import { editing, state } from "@/newtab/store";
import { useObjectUrl } from "./useObjectUrl";

/** 壁纸层：静态图 / 动态视频 / 默认渐变；含后台暂停与编辑态变暗。 */
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

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import {
  buildStationUrl,
  formatBitrate,
  formatTags,
  MAX_STATIONS,
  parseStations,
  RADIO_CACHE_TTL_MS,
  type RadioStation,
} from "./logic";
import "./radio.css";

const REQUEST_TIMEOUT_MS = 12_000;

interface Cache {
  at: number;
  tag: string;
  stations: RadioStation[];
}

export default function Radio({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const tag = typeof props.tag === "string" && props.tag ? props.tag : "jazz";
  const limit = typeof props.limit === "number" && props.limit > 0 ? Math.min(MAX_STATIONS, props.limit) : 12;
  const volume = typeof props.volume === "number" ? Math.min(1, Math.max(0, props.volume)) : 0.6;

  const cached = runtime.data.get<Cache>("cache");
  const initialStations = cached && cached.tag === tag ? cached.stations : [];
  const [stations, setStations] = useState<RadioStation[]>(initialStations);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wasPlayingRef = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      const cache = runtimeRef.current.data.get<Cache>("cache");
      if (!force && cache && cache.tag === tag && Date.now() - cache.at < RADIO_CACHE_TTL_MS) {
        setStations(cache.stations);
        setStatus("idle");
        return;
      }
      setStatus("loading");
      setError(null);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(buildStationUrl(tag, limit), {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseStations(await response.json(), limit);
        if (parsed.length === 0) throw new Error("这个分类下没有可用的 https 电台");
        const next: Cache = { at: Date.now(), tag, stations: parsed };
        runtimeRef.current.data.set("cache", next);
        setStations(parsed);
        setStatus("idle");
      } catch (err) {
        const message = String((err as Error).message ?? err);
        setError(message.includes("abort") ? "请求超时" : message);
        setStatus("error");
      } finally {
        clearTimeout(timer);
      }
    },
    [tag, limit],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // 页面隐藏时暂停（省流量/省电），回来时自动续播
  useEffect(() => {
    const off = runtimeRef.current.visibility.onChange((visible) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!visible) {
        wasPlayingRef.current = !audio.paused;
        audio.pause();
      } else if (wasPlayingRef.current) {
        void audio.play().catch(() => undefined);
      }
    });
    return () => {
      off();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const play = async (station: RadioStation) => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = "none";
      audio.volume = volume;
      audio.addEventListener("error", () => {
        setPlayError("这个电台暂时无法播放（源可能已失效或不是 https）");
        setPlayingId(null);
      });
      audioRef.current = audio;
    }
    setPlayError(null);

    if (playingId === station.id && !audio.paused) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = station.url;
    try {
      await audio.play();
      setPlayingId(station.id);
    } catch (err) {
      setPlayError(`播放失败：${String((err as Error).message ?? err)}`);
      setPlayingId(null);
    }
  };

  const stop = () => {
    audioRef.current?.pause();
    setPlayingId(null);
  };

  const current = stations.find((station) => station.id === playingId) ?? null;

  return (
    <div class="kt-radio" data-testid="radio">
      <div class="kt-radio-head">
        <span class="kt-radio-title">在线电台</span>
        <span class="kt-radio-meta">
          {status === "loading" ? "加载中…" : current ? `正在播放：${current.name}` : `${stations.length} 个电台`}
        </span>
        {playingId ? (
          <button class="kt-radio-btn" onClick={stop} data-testid="radio-stop">
            停止
          </button>
        ) : (
          <button
            class="kt-radio-refresh"
            title="换一批"
            onClick={() => void load(true)}
            data-testid="radio-refresh"
          >
            ⟳
          </button>
        )}
      </div>

      <div class="kt-radio-list">
        {stations.map((station) => (
          <button
            class={`kt-radio-row ${station.id === playingId ? "kt-radio-active" : ""}`}
            key={station.id}
            onClick={() => void play(station)}
            title={station.homepage || station.url}
            data-testid="radio-station"
          >
            <span class="kt-radio-play">{station.id === playingId ? "⏸" : "▶"}</span>
            <span class="kt-radio-info">
              <span class="kt-radio-name">{station.name}</span>
              <span class="kt-radio-tags">
                {formatTags(station)}
                {station.bitrate ? ` · ${formatBitrate(station.bitrate)}` : ""}
              </span>
            </span>
          </button>
        ))}
        {stations.length === 0 && status === "loading"
          ? Array.from({ length: 5 }, (_, i) => <div class="kt-radio-skeleton" key={i} />)
          : null}
        {stations.length === 0 && status !== "loading" && !error ? (
          <p class="kt-radio-empty">这个分类下暂时没有可用电台</p>
        ) : null}
      </div>

      {error || playError ? (
        <div class="kt-radio-error" data-testid="radio-error">
          <span>{error ?? playError}</span>
        </div>
      ) : null}
    </div>
  );
}

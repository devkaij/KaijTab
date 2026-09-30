import { useEffect, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import { dateKey, pickQuote, type QuoteMode } from "./logic";
import "./quote.css";

export default function Quote({ props }: ModuleProps) {
  const mode: QuoteMode = props.mode === "random" ? "random" : "daily";
  const showSource = props.showSource !== false;

  const [quote, setQuote] = useState(() => pickQuote(new Date(), mode));

  // 跨天自动换（每分钟检查一次日期键变化；随机模式下也只在跨天时换）
  useEffect(() => {
    let key = dateKey(new Date());
    const timer = setInterval(() => {
      const next = dateKey(new Date());
      if (next !== key) {
        key = next;
        setQuote(pickQuote(new Date(), mode));
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    setQuote(pickQuote(new Date(), mode));
  }, [mode]);

  return (
    <div class="kt-quote" data-testid="quote">
      <p class="kt-quote-text">{quote.text}</p>
      {showSource && quote.from ? <p class="kt-quote-from">— {quote.from}</p> : null}
    </div>
  );
}

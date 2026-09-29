import { useEffect } from "preact/hooks";

export function App() {
  useEffect(() => {
    document.title = "KaijTab";
  }, []);

  return (
    <main class="boot">
      <h1>KaijTab</h1>
      <p>自由画布式新标签页 · 脚手架就绪</p>
    </main>
  );
}

import { Component, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import { updateItemProps } from "@/newtab/store";
import { getModule } from "./registry";
import { createRuntime } from "./runtime";
import type { ModuleProps } from "./types";

const componentCache = new Map<string, ComponentType<ModuleProps>>();
const loadPromises = new Map<string, Promise<{ default: ComponentType<ModuleProps> }>>();

type LoadState =
  | { status: "loading" }
  | { status: "ready"; Component: ComponentType<ModuleProps> }
  | { status: "error"; error: Error };

function useModuleComponent(moduleId: string, attempt: number): { state: LoadState } {
  const [state, setState] = useState<LoadState>(() => {
    const cached = componentCache.get(moduleId);
    return cached ? { status: "ready", Component: cached } : { status: "loading" };
  });

  useEffect(() => {
    const cached = componentCache.get(moduleId);
    if (cached) {
      setState({ status: "ready", Component: cached });
      return;
    }
    const definition = getModule(moduleId);
    if (!definition) {
      setState({ status: "error", error: new Error(`未注册的模块：${moduleId}`) });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    let promise = loadPromises.get(moduleId);
    if (!promise) {
      promise = definition.load() as Promise<{ default: ComponentType<ModuleProps> }>;
      loadPromises.set(moduleId, promise);
    }

    promise
      .then((mod) => {
        componentCache.set(moduleId, mod.default);
        if (!cancelled) setState({ status: "ready", Component: mod.default });
      })
      .catch((error: Error) => {
        loadPromises.delete(moduleId);
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
    };
  }, [moduleId, attempt]);

  return { state };
}

class ModuleErrorBoundary extends Component<
  { children: ComponentChildren; onRetry: () => void },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  override componentDidCatch(error: Error): void {
    this.setState({ error });
  }

  override render() {
    if (this.state.error) {
      return (
        <div class="kt-module-fallback kt-module-error" data-testid="module-error">
          <span>模块运行出错</span>
          <code>{this.state.error.message}</code>
          <button
            class="kt-btn"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ModuleHost({
  moduleId,
  instanceId,
  props,
}: {
  moduleId: string;
  instanceId: string;
  props: Record<string, unknown>;
}) {
  const [attempt, setAttempt] = useState(0);
  const { state } = useModuleComponent(moduleId, attempt);

  if (state.status === "loading") {
    return <div class="kt-module-skeleton" data-testid="module-skeleton" />;
  }

  if (state.status === "error") {
    return (
      <div class="kt-module-fallback kt-module-error" data-testid="module-error">
        <span>模块加载失败</span>
        <code>{state.error.message}</code>
        <button class="kt-btn" onClick={() => setAttempt((a) => a + 1)}>
          重试
        </button>
      </div>
    );
  }

  const Component = state.Component;
  const runtime = createRuntime(moduleId, instanceId);

  return (
    <ModuleErrorBoundary onRetry={() => setAttempt((a) => a + 1)}>
      <div class="kt-module" data-module-id={moduleId}>
        <Component
          instanceId={instanceId}
          props={props}
          updateProps={(patch: Record<string, unknown>) => updateItemProps(instanceId, patch)}
          runtime={runtime}
        />
      </div>
    </ModuleErrorBoundary>
  );
}

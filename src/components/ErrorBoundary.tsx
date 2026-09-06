import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors anywhere below it so a bad API response or a
 * single broken screen can't white-screen the whole app. The "clear cached
 * data" action wipes only this app's SWR cache (the `iw.cache.` prefix), never
 * the watchlist itself.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  private clearCacheAndReload = () => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("iw.cache.")) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="errbox">
        <h2>Something broke</h2>
        <p>
          A screen hit an error and stopped rendering. Your watchlist is safe —
          it's stored separately.
        </p>
        <pre className="errbox-msg">{this.state.error.message}</pre>
        <div className="errbox-actions">
          <button onClick={() => location.reload()}>Reload</button>
          <button className="ghost" onClick={this.clearCacheAndReload}>
            Clear cached data &amp; reload
          </button>
        </div>
      </div>
    );
  }
}

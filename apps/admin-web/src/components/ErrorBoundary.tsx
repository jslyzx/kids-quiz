import { Component, type ErrorInfo, type ReactNode } from 'react';

/* ========================================
   全局错误边界
   避免单个组件抛错导致整页白屏
   ======================================== */

interface Props {
  children: ReactNode;
  /** 自定义渲染（可选），用于不同区域定制 */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 不上报到外部，仅控制台，避免敏感信息外泄
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <DefaultFallback error={error} onReset={this.reset} />;
  }
}

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div className="error-boundary">
      <div className="error-boundary-card">
        <div className="error-boundary-icon" aria-hidden="true">😵</div>
        <h2>页面出错了</h2>
        <p>抱歉，发生了意外错误。可以尝试重试，或刷新页面。</p>
        {error?.message ? (
          <details className="error-boundary-detail">
            <summary>详细信息</summary>
            <pre>{error.message}</pre>
          </details>
        ) : null}
        <div className="error-boundary-actions">
          <button type="button" className="btn btn-primary" onClick={onReset}>重试</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      </div>
    </div>
  );
}

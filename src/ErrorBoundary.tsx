import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Lesson crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen px-6 py-16">
          <div className="mx-auto max-w-2xl rounded-2xl border border-signal-bad/30 bg-paper-card p-6 shadow-card">
            <p className="font-mono text-xs uppercase tracking-wider text-signal-bad mb-3">
              Lesson crashed
            </p>
            <pre className="font-mono text-sm whitespace-pre-wrap text-ink-muted">
              {String(this.state.error?.stack ?? this.state.error)}
            </pre>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

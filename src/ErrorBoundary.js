import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
export class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('Lesson crashed:', error, info);
    }
    render() {
        if (this.state.error) {
            return (_jsx("main", { className: "min-h-screen px-6 py-16", children: _jsxs("div", { className: "mx-auto max-w-2xl rounded-2xl border border-signal-bad/30 bg-paper-card p-6 shadow-card", children: [_jsx("p", { className: "font-mono text-xs uppercase tracking-wider text-signal-bad mb-3", children: "Lesson crashed" }), _jsx("pre", { className: "font-mono text-sm whitespace-pre-wrap text-ink-muted", children: String(this.state.error?.stack ?? this.state.error) })] }) }));
        }
        return this.props.children;
    }
}

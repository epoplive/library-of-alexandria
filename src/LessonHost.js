import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadLesson } from './lessons-glob';
import { ErrorBoundary } from './ErrorBoundary';
export default function LessonHost() {
    const { slug } = useParams();
    const [loaded, setLoaded] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!slug)
            return;
        setError(null);
        setLoaded(null);
        loadLesson(slug)
            .then((res) => {
            if (!res)
                setError(`No lesson at /lessons/${slug}.`);
            else
                setLoaded(res);
        })
            .catch((e) => setError(String(e)));
    }, [slug]);
    if (error)
        return _jsx(NotFound, { message: error });
    if (!loaded)
        return _jsx(Loading, {});
    const { Component } = loaded;
    return (_jsx(ErrorBoundary, { children: _jsx(Component, {}) }));
}
function Loading() {
    return (_jsx("main", { className: "min-h-screen flex items-center justify-center", children: _jsx("p", { className: "font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle animate-pulse", children: "Loading lesson\u2026" }) }));
}
function NotFound({ message }) {
    return (_jsx("main", { className: "min-h-screen px-6 py-16", children: _jsxs("div", { className: "mx-auto max-w-xl text-center", children: [_jsx("p", { className: "font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle mb-4", children: "404" }), _jsx("h1", { className: "font-display text-3xl font-semibold mb-3", children: "Lesson not found" }), _jsx("p", { className: "text-ink-muted mb-8", children: message }), _jsx(Link, { to: "/", className: "font-mono text-xs uppercase tracking-[0.18em] text-accent hover:text-accent-hover", children: "\u2190 Back to lessons" })] }) }));
}

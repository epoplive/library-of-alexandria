import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, } from 'recharts';
const PALETTE = ['#5b21b6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
export function Plot({ data, x, y, kind = 'line', caption, height = 280, legend = false, }) {
    const ys = Array.isArray(y) ? y : [y];
    return (_jsxs("figure", { className: "my-6", children: [_jsx("div", { className: "rounded-2xl bg-paper-card border border-ink-subtle/15 p-4", children: _jsx(ResponsiveContainer, { width: "100%", height: height, children: kind === 'line' ? (_jsxs(LineChart, { data: data, margin: { top: 16, right: 16, bottom: 8, left: 0 }, children: [_jsx(CartesianGrid, { stroke: "#e2e8f0", strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: x, stroke: "#94a3b8", fontSize: 12 }), _jsx(YAxis, { stroke: "#94a3b8", fontSize: 12 }), _jsx(Tooltip, { contentStyle: {
                                    borderRadius: 12,
                                    border: '1px solid #e2e8f0',
                                    fontSize: 13,
                                } }), legend && _jsx(Legend, { wrapperStyle: { fontSize: 12 } }), ys.map((key, i) => (_jsx(Line, { type: "monotone", dataKey: key, stroke: PALETTE[i % PALETTE.length], strokeWidth: 2.5, dot: false }, key)))] })) : (_jsxs(BarChart, { data: data, margin: { top: 16, right: 16, bottom: 8, left: 0 }, children: [_jsx(CartesianGrid, { stroke: "#e2e8f0", strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: x, stroke: "#94a3b8", fontSize: 12 }), _jsx(YAxis, { stroke: "#94a3b8", fontSize: 12 }), _jsx(Tooltip, { contentStyle: {
                                    borderRadius: 12,
                                    border: '1px solid #e2e8f0',
                                    fontSize: 13,
                                } }), legend && _jsx(Legend, { wrapperStyle: { fontSize: 12 } }), ys.map((key, i) => (_jsx(Bar, { dataKey: key, fill: PALETTE[i % PALETTE.length], radius: [6, 6, 0, 0] }, key)))] })) }) }), caption && (_jsx("figcaption", { className: "mt-2 text-center text-sm text-ink-muted", children: caption }))] }));
}

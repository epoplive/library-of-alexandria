import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route } from 'react-router-dom';
import LessonIndex from './LessonIndex';
import LessonHost from './LessonHost';
export default function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LessonIndex, {}) }), _jsx(Route, { path: "/lesson/:slug", element: _jsx(LessonHost, {}) })] }));
}

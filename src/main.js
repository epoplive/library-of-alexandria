import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
// HashRouter so we can deploy as a static bundle to GitHub Pages
// without server-side routing. URLs look like /#/lesson/foo.
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(HashRouter, { children: _jsx(App, {}) }) }));

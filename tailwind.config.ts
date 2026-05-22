import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', './lessons/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0f172a',
          muted: '#475569',
          subtle: '#94a3b8',
        },
        paper: {
          DEFAULT: '#fafaf7',
          card: '#ffffff',
          tint: '#f1f5f9',
        },
        accent: {
          DEFAULT: '#5b21b6',
          hover: '#4c1d95',
          soft: '#ede9fe',
        },
        signal: {
          info: '#0ea5e9',
          good: '#10b981',
          warn: '#f59e0b',
          bad: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.04)',
        focus: '0 0 0 3px rgb(91 33 182 / 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;

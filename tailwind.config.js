/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // VerionX brand
        brand: {
          DEFAULT: '#EE1B24',
          bright: '#FF3A42',
          deep: '#B4131A',
          wash: 'rgba(238,27,36,0.12)',
        },
        ink: {
          900: '#0E0F11',
          850: '#141517',
          800: '#191A1D',
          750: '#1F2124',
          700: '#26282C',
          600: '#333639',
          500: '#4A4E53',
        },
        chalk: {
          DEFAULT: '#E9EBEE',
          dim: '#A5ABB3',
          faint: '#71777E',
        },
        eval: {
          up: '#3FD07A',
          down: '#FF5A5F',
          warn: '#F5A524',
          info: '#4EA8FF',
        },
        // Follows the chosen skill level. Opacity modifiers still work because
        // --accent holds a bare RGB triplet.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Space Grotesk has the slightly engineered feel of the subject without
        // tipping into novelty; Inter carries the reading load underneath it.
        display: ['"Space Grotesk"', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 28px rgba(0,0,0,0.35)',
        pop: '0 18px 50px rgba(0,0,0,0.55)',
      },
      keyframes: {
        popIn: { '0%': { opacity: '0', transform: 'translateY(6px) scale(0.98)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(238,27,36,0.45)' }, '100%': { boxShadow: '0 0 0 14px rgba(238,27,36,0)' } },
        slideUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        popIn: 'popIn .22s cubic-bezier(.2,.9,.3,1)',
        pulseRing: 'pulseRing 1.2s ease-out infinite',
        slideUp: 'slideUp .28s cubic-bezier(.2,.9,.3,1)',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

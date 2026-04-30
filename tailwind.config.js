/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Outfit', 'sans-serif'],
        display: ['Bebas Neue', 'sans-serif'],
      },
      colors: {
        // ── Sempre Brand ──────────────────────────────────────
        brand: {
          orange:       '#FF6B00',
          'orange-dark':'#E05A00',
          blue:         '#003087',
          'blue-mid':   '#0052CC',
          'blue-light': '#E6EEFF',
          green:        '#00875A',
          yellow:       '#FF8B00',
          purple:       '#6554C0',
          red:          '#DE350B',
        },
        // ── Surfaces (light) ──────────────────────────────────
        surface: {
          bg:   '#F4F6FA',
          s1:   '#FFFFFF',
          s2:   '#F0F3F8',
          s3:   '#E8EDF5',
          b:    '#DDE3EE',
          b2:   '#C8D0E0',
        },
        // ── Text ──────────────────────────────────────────────
        ink: {
          DEFAULT: '#1A2340',
          muted:   '#6B7897',
        },
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '7px',
        md: '9px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        sidebar: '4px 0 24px rgba(0,48,135,0.18)',
        card:    '0 1px 6px rgba(0,48,135,0.05)',
        orange:  '0 4px 16px rgba(255,107,0,0.40)',
        kpi:     '0 1px 6px rgba(0,48,135,0.05)',
      },
    },
  },
  plugins: [],
};

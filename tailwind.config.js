/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Courier New"', 'Courier', 'monospace'],
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#111111',
          soft: '#444444',
          muted: '#888888',
        },
        paper: {
          DEFAULT: '#ffffff',
          warm: '#fafaf8',
          border: '#e5e5e5',
        },
        amber: {
          chord: '#FFD700',
          accent: '#F59E0B',
          soft: '#FEF3C7',
        },
        stage: {
          bg: '#000000',
          chord: '#FFD700',
          lyric: '#FFFFFF',
          border: '#333333',
        }
      },
      fontSize: {
        'chord': ['12px', { lineHeight: '1.2', fontWeight: '700' }],
        'lyric': ['12px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        'chord-gap': '4px',
        'section-gap': '16px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        }
      }
    },
  },
  plugins: [],
}

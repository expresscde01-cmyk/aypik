/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(40px) rotate(8deg)' },
          '100%': { opacity: '1', transform: 'translateX(0) rotate(0)' },
        },
        slideOutLeft: {
          '0%': { opacity: '1', transform: 'translateX(0) rotate(0)' },
          '100%': { opacity: '0', transform: 'translateX(-120px) rotate(-12deg)' },
        },
        slideOutRight: {
          '0%': { opacity: '1', transform: 'translateX(0) rotate(0)' },
          '100%': { opacity: '0', transform: 'translateX(120px) rotate(12deg)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.35s ease-out',
        slideInRight: 'slideInRight 0.3s ease-out',
        slideOutLeft: 'slideOutLeft 0.3s ease-in forwards',
        slideOutRight: 'slideOutRight 0.3s ease-in forwards',
        pop: 'pop 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

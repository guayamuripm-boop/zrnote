/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'zr-navy': 'var(--zr-navy)',
        'zr-blue': 'var(--zr-blue)',
        'zr-blue-mid': 'var(--zr-blue-mid)',
        'zr-blue-light': 'var(--zr-blue-light)',
        'zr-blue-pale': 'var(--zr-blue-pale)',
        'zr-white': 'var(--zr-white)',
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        surface: {
          base: 'var(--background)',
          card: 'var(--bg-card)',
          elevated: 'var(--bg-elevated)',
        },
      },
      fontFamily: {
        poppins: ['var(--font-poppins)', 'sans-serif'],
        sora: ['var(--font-sora)', 'sans-serif'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
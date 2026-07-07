/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'zr-navy': '#1e1b4b',
        'zr-blue': '#4338ca',
        'zr-blue-mid': '#6366f1',
        'zr-blue-light': '#818cf8',
        'zr-blue-pale': '#c7d2fe',
        'zr-white': '#ffffff',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};

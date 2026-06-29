/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'zr-navy': '#21284F',
        'zr-blue': '#1E4D96',
        'zr-blue-mid': '#3869B1',
        'zr-blue-light': '#6590CB',
        'zr-blue-pale': '#98BAE3',
        'zr-white': '#FFFFFF',
      },
      fontFamily: {
        'roboto': ['Roboto', 'sans-serif'],
        'raleway': ['Raleway', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

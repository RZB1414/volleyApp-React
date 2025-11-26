/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#34d399',
          secondary: '#38bdf8',
          accent: '#f472b6',
        },
      },
      boxShadow: {
        glow: '0 0 45px rgba(52, 211, 153, 0.25)',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        mandarina: {
          50:  '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#FF6B00',
          600: '#ea580c',
          700: '#c2410c',
          900: '#431407',
        },
        indstore: {
          500: '#1A1A2E',
          600: '#16213E',
        }
      },
      // ⚠️ 'Inter' aquí es el NOMBRE de una fuente instalada, no la webfont de
      // next/font (esa vive en var(--font-inter) y solo la usa la cotización:
      // ver app/layout.js). O sea: la interfaz se ve en system-ui salvo en PCs
      // con Inter instalado. Cambiar a `var(--font-inter)` es una decisión
      // VISUAL aparte (anchos, cortes de línea): no tocar de pasada.
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

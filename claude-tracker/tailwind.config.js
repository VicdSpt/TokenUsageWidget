/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          bg:          '#0d1117',
          surface:     '#161b22',
          border:      '#30363d',
          accent:      '#00cc6a',
          'accent-dim':'#006d32',
          text:        '#e6edf3',
          muted:       '#8b949e',
        }
      }
    }
  },
  plugins: []
}

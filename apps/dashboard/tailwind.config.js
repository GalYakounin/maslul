/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-dark': 'var(--color-primary-dark)',
        secondary: 'var(--color-secondary)',
        danger: 'var(--color-danger)',
        surface: 'var(--color-surface)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
      },
    },
  },
  plugins: [],
};

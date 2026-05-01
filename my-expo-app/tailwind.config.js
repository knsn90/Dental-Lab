/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './modules/**/*.{js,jsx,ts,tsx}',
    './core/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // ── shadcn/ui standard tokens (HSL CSS vars) ─────────────────────
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        info:    'hsl(var(--info))',

        // ── Panel accent'leri (uygulamaya özel) ──────────────────────────
        lab:       'hsl(var(--lab))',
        doctor:    'hsl(var(--doctor))',
        clinic:    'hsl(var(--clinic))',
        admin:     'hsl(var(--admin))',

        // ── Mali İşlemler accent'leri (sabit) ────────────────────────────
        profit:    '#059669',
        invoice:   '#2563EB',
        balance:   '#0EA5E9',
        expense:   '#DC2626',
        budget:    '#7C3AED',
        check:     '#D97706',
        cash:      '#059669',
        pricelist: '#0891B2',

        // Eski projeden gelen tokenler (geri uyumluluk)
        page:    '#F1F5F9',
        surface: '#FFFFFF',
        danger:  'hsl(var(--destructive))',
      },

      borderRadius: {
        lg:   'var(--radius)',
        md:   'calc(var(--radius) - 2px)',
        sm:   'calc(var(--radius) - 4px)',
        // Eski card token (geri uyumluluk)
        card: '14px',
      },

      borderColor: {
        // Eski projeden — geri uyumluluk
        card: 'rgba(255,255,255,0.95)',
      },

      boxShadow: {
        sm:        '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md:        '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg:        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl:        '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        // Eski Cards Design
        card:      '0 8px 24px rgba(0,0,0,0.15)',
        cardLite:  '0 4px 12px rgba(0,0,0,0.08)',
        cardHero:  '0 12px 36px rgba(0,0,0,0.18)',
      },

      maxWidth: {
        canvas:    '1280px',
        canvasLg:  '1440px',
        canvasMd:  '980px',
        prose:     '720px',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
    screens: {
      sm:    '640px',
      md:    '768px',
      lg:    '1024px',
      xl:    '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './modules/**/*.{js,jsx,ts,tsx}',
    './core/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // ── Renkler — projedeki Cards Design + panel accent'leri
      colors: {
        // Page bg'ler
        page:    '#F1F5F9',  // Cards Design page background
        surface: '#FFFFFF',  // Card surface
        // Panel accent'leri
        lab:    '#2563EB',
        admin:  '#0F172A',
        doctor: '#0EA5E9',
        clinic: '#0369A1',
        // Mali İşlemler accent'leri (FinanceHubScreen)
        profit:    '#059669',
        invoice:   '#2563EB',
        balance:   '#0EA5E9',
        expense:   '#DC2626',
        budget:    '#7C3AED',
        check:     '#D97706',
        cash:      '#059669',
        pricelist: '#0891B2',
        // Status renkleri
        success: '#10B981',
        warning: '#F59E0B',
        danger:  '#DC2626',
        info:    '#0EA5E9',
      },

      // ── Cards Design System token'ları
      borderRadius: {
        card:  '14px',
      },
      borderColor: {
        card: 'rgba(255,255,255,0.95)',  // Cards spec — transparent overlay
      },
      boxShadow: {
        // Cards primary shadow
        card:     '0 8px 24px rgba(0,0,0,0.15)',
        cardLite: '0 4px 12px rgba(0,0,0,0.08)',
        cardHero: '0 12px 36px rgba(0,0,0,0.18)',
      },

      // ── Spacing — desktop oluşumu için
      maxWidth: {
        canvas:    '1280px',
        canvasLg:  '1440px',
        canvasMd:  '980px',
        prose:     '720px',
      },

      // ── Typography
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tight2: '-0.6px',
      },
    },
    screens: {
      // Web-friendly breakpoints (mobile, tablet, desktop, wide)
      sm:  '640px',
      md:  '768px',
      lg:  '1024px',
      xl:  '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [],
};

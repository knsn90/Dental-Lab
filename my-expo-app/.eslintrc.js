module.exports = {
  extends: ['expo'],
  rules: {
    // ── React Compiler kuralları (expo@56'da yeni, mevcut kod uyumlu değil) ──
    // Kademeli geçiş için kapatıldı
    'react-hooks/refs':                        'off',
    'react-hooks/set-state-in-effect':         'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/purity':                      'off',
    'react-hooks/immutability':                'off',
    'react-hooks/static-components':           'off',
    'react-hooks/error-boundaries':            'off',
    'react-hooks/globals':                     'off',
    // Hook dependency array — warn yeterli
    'react-hooks/exhaustive-deps':             'warn',

    // ── TypeScript ──
    '@typescript-eslint/no-explicit-any':   'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // ── Genel ──
    'no-console':    ['warn', { allow: ['warn', 'error'] }],
    'import/first':  'off',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.expo/',
    'supabase/functions/',
    'scripts/',
  ],
};

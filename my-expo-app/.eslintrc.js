module.exports = {
  extends: ['expo'],
  rules: {
    // console.log production'da bırakılmasın
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Kullanılmayan import/değişken
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // any kullanımını uyarıya çevir (strict ban yerine)
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.expo/',
    'supabase/functions/',
    'scripts/',
  ],
};

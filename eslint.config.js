// The app runs in the browser; the tests run in Node. share.js deliberately
// straddles both (btoa/atob in a browser, Buffer in Node) so it stays testable
// outside a DOM, hence the shared block below.

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  performance: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AudioContext: 'readonly',
  webkitAudioContext: 'readonly',
  history: 'readonly',
  location: 'readonly',
  matchMedia: 'readonly',
  devicePixelRatio: 'readonly',
  ResizeObserver: 'readonly',
  MessageChannel: 'readonly',
  btoa: 'readonly',
  atob: 'readonly',
};

const nodeGlobals = {
  Buffer: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
};

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...browserGlobals, Buffer: 'readonly' },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...nodeGlobals, AudioContext: 'readonly', webkitAudioContext: 'readonly' },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
];

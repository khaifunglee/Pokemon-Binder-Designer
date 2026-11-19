// Expo's recommended flat config (React, React Hooks, TypeScript, import rules).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Generated or build output; linting it only produces noise.
    ignores: ['dist/*', 'drizzle/*'],
  },
]);

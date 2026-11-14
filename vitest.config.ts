import { defineConfig } from 'vitest/config'
// Share one React instance across DSH client packages and tests.
// The integration specs open real SQLite stores and drive Sessions; 15 s keeps a loaded machine from timing them out.
export default defineConfig({ resolve: { dedupe: ['react', 'react-dom'] }, test: { include: ['tests/**/*.spec.{ts,tsx}'], testTimeout: 15_000 } })

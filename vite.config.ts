/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    // Pure-logic unit tests run in Node (no DOM needed). Add 'jsdom' + React Testing
    // Library later for component tests.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

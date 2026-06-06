/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the big, rarely-changing libraries into their own chunks so they cache
        // independently of app code (and Leaflet/dnd-kit only download with the trip
        // routes that use them, not on the public landing page).
        manualChunks(id) {
          if (id.includes('node_modules/leaflet')) return 'leaflet'
          if (id.includes('node_modules/@dnd-kit')) return 'dndkit'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/@sentry')) return 'sentry'
          return undefined
        },
      },
    },
  },
  test: {
    // Pure-logic unit tests run in Node (no DOM needed). Add 'jsdom' + React Testing
    // Library later for component tests.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

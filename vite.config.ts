import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Prebundle the lazy-loaded model runtime before the first camera session.
  optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // @notesnook/editor transitively imports @notesnook/core (Notesnook's
    // local database engine), which expects Node globals like Buffer to
    // exist at module load time. This polyfills them for the browser.
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    react(),
  ],
  server: {
  port: 5173,
  proxy: {
    "/api": "http://localhost:8787",
    "/apimeta": "http://localhost:8787",
  },
},
})

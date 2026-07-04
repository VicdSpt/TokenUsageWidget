import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// When running inside Claude Code or VS Code (which are Electron apps), they set
// ELECTRON_RUN_AS_NODE=1 so their Node.js subprocess runs without Chromium. We must
// delete it here so electron-vite's child Electron process starts as a real Electron app.
delete process.env['ELECTRON_RUN_AS_NODE']

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})

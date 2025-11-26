import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { transform } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const jsxInJsPlugin = {
  name: 'jsx-in-js-loader',
  enforce: 'pre',
  async transform(code, id) {
    if (!id.endsWith('.js')) return null
    if (id.includes('node_modules')) return null
    const result = await transform(code, {
      loader: 'jsx',
      jsx: 'automatic',
    })
    return { code: result.code }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    jsxInJsPlugin,
    react({
      include: '**/*.{jsx,js,tsx,ts}',
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.js$/,
    },
  },
})

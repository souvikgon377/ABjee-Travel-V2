import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: [
      'unminding-emil-cateringly.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok.io'
    ],
    hmr: {
      overlay: true
    },
    watch: {
      usePolling: false
    }
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/database'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui': ['framer-motion', 'lucide-react'],
          'forms': ['react-hook-form', 'zod', '@hookform/resolvers'],
          'dropdown-menu': ['@radix-ui/react-dropdown-menu'],
          'dialog': ['@radix-ui/react-dialog'],
          'popover': ['@radix-ui/react-popover']
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.');
          const ext = info?.[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || '')) {
            return `assets/images/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      }
    },
    chunkSizeWarningLimit: 600,
    cssMinify: 'esbuild',
    reportCompressedSize: false, // Faster builds
    assetsInlineLimit: 4096, // Inline assets smaller than 4KB
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/database',
      '@number-flow/react',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  clearScreen: false
})
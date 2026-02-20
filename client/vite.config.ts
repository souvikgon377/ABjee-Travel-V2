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
    ]
  },
  resolve: {
    alias: {
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
      }
    },
    chunkSizeWarningLimit: 600
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'firebase/app', 'firebase/auth', 'firebase/database']
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { livestoreDevtoolsPlugin } from '@livestore/devtools-vite'
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Add headers for WASM and worker files
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  // Ensure Vite treats .wasm files as assets for proper serving
  assetsInclude: ['**/*.wasm'],
  plugins: [
    react(),
    livestoreDevtoolsPlugin({ schemaPath: './src/livestore/schema.ts' }),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  worker: { 
    format: 'es'
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['kuzu-wasm']
  },
  build: {
    // Optimize build for memory efficiency
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split chunks more aggressively to reduce memory usage
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          'query-vendor': ['@tanstack/react-query'],
          'router-vendor': ['react-router-dom'],
          
          // Large application modules
          'kuzu-core': ['kuzu-wasm', '@/lib/kuzu/KuzuService', '@/lib/kuzu/KuzuSchemaManager'],
          'json-manager': ['@/json-manager/JSONManager', '@/json-manager/EnhancedJSONManager'],
          'editor-core': ['@blocknote/core', '@blocknote/react', '@blocknote/mantine'],
          'transformers': ['@huggingface/transformers'],
          
          // Services and utilities
          'services': [
            '@/services/GraphService', 
            '@/services/KuzuSyncService', 
            '@/services/KuzuMemoryService'
          ],
          'components': [
            '@/components/NoteEditor', 
            '@/components/entity-browser/EntityBrowser'
          ]
        }
      }
    },
    // Increase memory allocation and optimize for development builds
    ...(mode === 'development' && {
      minify: false,
      sourcemap: true,
      target: 'esnext'
    })
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    exclude: ['kuzu-wasm'],
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-router-dom'
    ]
  }
}))

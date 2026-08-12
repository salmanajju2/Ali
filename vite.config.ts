
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        plugins: [react()],
        define: {
            'process.env': {} // Don't dump entire system env
        },
        server: {
            port: 3000
        },
        build: {
            outDir: 'dist',
            sourcemap: false,
            rollupOptions: {
                output: {
                    manualChunks: undefined
                }
            }
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        }
    };
});

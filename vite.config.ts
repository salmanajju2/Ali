
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
            port: 3000,
            // Needed only for the temporary local test link exposed by the sandbox.
            allowedHosts: true,
            // Local test mode keeps the browser same-origin while forwarding API
            // and Socket.IO traffic to the deployed Aiven-backed backend.
            proxy: {
                '/api': {
                    target: 'https://ali-ltyt.onrender.com',
                    changeOrigin: true,
                    secure: true,
                },
                '/socket.io': {
                    target: 'https://ali-ltyt.onrender.com',
                    changeOrigin: true,
                    secure: true,
                    ws: true,
                },
            },
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

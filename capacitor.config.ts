import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ali.enterprises',
  appName: 'ali-enterprises',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    allowMixedContent: true, // HTTP + HTTPS dono allow karo
    webContentsDebuggingEnabled: true, // Debug ke liye
  },
  server: {
    // APK ke liye Socket server hostname explicitly allow karo
    allowNavigation: [
      'ali-ltyt.onrender.com',
    ],
  },
};

export default config;

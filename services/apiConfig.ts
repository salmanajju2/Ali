import { Capacitor } from '@capacitor/core';

const RENDER_API_ORIGIN = 'https://ali-ltyt.onrender.com';
const configuredOrigin = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '');

/**
 * The web app and API share a host in a normal browser, but a Capacitor APK is
 * served from the device's local WebView origin. Native clients must therefore
 * use the public Render host for API, Socket.IO, and Discord proxy requests.
 */
export const API_ORIGIN = configuredOrigin || (
  typeof window === 'undefined' || Capacitor.isNativePlatform()
    ? RENDER_API_ORIGIN
    : window.location.origin
);

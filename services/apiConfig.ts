import { Capacitor } from '@capacitor/core';

const configuredOrigin = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '');

/**
 * Cloudflare D1 is the application data authority. Socket.IO is disabled by
 * default; this optional origin is retained only for an explicitly enabled
 * realtime adapter during development.
 */
export const API_ORIGIN = configuredOrigin || '';

export const IS_NATIVE = Capacitor.isNativePlatform();

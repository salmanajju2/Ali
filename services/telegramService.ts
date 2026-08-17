// Native APKs are served from a local WebView origin, so proxy calls must use
// the public Render backend instead of window.location.origin.
import { API_ORIGIN } from './apiConfig';
import { getSessionToken } from '../context/AuthContext';

const PROXY_SERVER = API_ORIGIN;

const proxyFetch = (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers, credentials: 'omit' });
};

/**
 * Uploads a photo or document (PDF) to the PHOTO bot directly via Telegram API
 */
export const sendTelegramPhoto = async (base64Data: string): Promise<string | null> => {
  try {
    const base64Parts = base64Data.split(',');
    const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const isPdf = mime === 'application/pdf';
    const fileName = isPdf ? 'slip.pdf' : mime === 'image/png' ? 'slip.png' : 'slip.jpg';

    console.log(`[Discord Upload] Initiating upload for file: ${fileName}, mime: ${mime}`);
    console.log(`[Discord Upload] Target Proxy Server: ${PROXY_SERVER}`);

    // Call proxy server's Discord upload endpoint
    const response = await proxyFetch(`${PROXY_SERVER}/discord/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Data,
        fileName,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Discord Upload] Proxy returned error status ${response.status}:`, errText);
      throw new Error(`Proxy upload returned ${response.status}`);
    }

    const data = await response.json();
    console.log('[Discord Upload] Proxy response data:', data);

    if (data.success && data.messageId) {
      const retValue = isPdf ? `pdf:${data.messageId}:${data.messageId}` : `${data.messageId}:${data.messageId}`;
      console.log(`[Discord Upload] Success! Storing slip identifier: tg:${retValue}`);
      return retValue;
    }
    console.warn('[Discord Upload] Proxy upload returned success=false or missing messageId');
    return null;
  } catch (error) {
    console.error('[Discord Upload] Failed to upload via Discord Webhook proxy:', error);
    return null;
  }
};

/**
 * Gets a temporary file URL from the bots
 */
export const getTelegramPhotoUrl = async (fileId: string): Promise<string | null> => {
    // Check if it's a Discord message ID (17-20 digit number)
    const isDiscordId = /^\d{17,20}$/.test(fileId);
    console.log(`[Discord Fetch] Resolving URL for fileId: "${fileId}". Is Discord ID? ${isDiscordId}`);

    if (isDiscordId) {
        try {
            console.log(`[Discord Fetch] Calling proxy server: ${PROXY_SERVER}/discord/getFileUrl?messageId=${fileId}`);
            const response = await proxyFetch(`${PROXY_SERVER}/discord/getFileUrl?messageId=${fileId}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`[Discord Fetch] Discord file URL response:`, data);
                return data.url || null;
            }
            console.error(`[Discord Fetch] Discord proxy returned non-OK status: ${response.status}`);
        } catch (error) {
            console.error('[Discord Fetch] Failed to get URL from Discord Webhook proxy:', error);
        }
        return null;
    }

    console.log('[Discord Fetch] Falling back to Telegram proxy for legacy fileId:', fileId);
    // Fallback to Telegram (legacy) via proxy to bypass regional blocking in India
    try {
        const response = await proxyFetch(`${PROXY_SERVER}/telegram/getFileUrl?fileId=${encodeURIComponent(fileId)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.proxyUrl || data.url) {
                const proxiedUrl = data.proxyUrl?.startsWith('/')
                  ? `${PROXY_SERVER}${data.proxyUrl}`
                  : `${PROXY_SERVER}/telegram/fetchFile?url=${encodeURIComponent(data.url)}`;
                console.log(`[Telegram Fetch] Successfully resolved legacy proxied URL:`, proxiedUrl);
                return proxiedUrl;
            }
        }
    } catch (error) {
        console.error('[Telegram Fetch] Failed to resolve legacy file via proxy:', error);
    }
    return null;
};

/**
 * Sends a text message to the TEXT bot directly via Telegram API
 */
export const sendTelegramMessage = async (message: string) => {
  try {
    await proxyFetch(`${PROXY_SERVER}/telegram/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  } catch (error) {
    console.error('Failed message via Telegram:', error);
  }
};

/**
 * Deletes a message containing a photo/document from the Telegram channel/chat or Discord server
 */
export const deleteTelegramMessage = async (messageId: string | number): Promise<boolean> => {
  if (!messageId) return false;
  
  // Check if it's a Discord message ID
  const isDiscordId = /^\d{17,20}$/.test(String(messageId));
  console.log(`[Discord Delete] Request to delete messageId: "${messageId}". Is Discord ID? ${isDiscordId}`);

  if (isDiscordId) {
    try {
      console.log(`[Discord Delete] Calling proxy server delete message endpoint: ${PROXY_SERVER}/discord/deleteMessage/${messageId}`);
      const response = await proxyFetch(`${PROXY_SERVER}/discord/deleteMessage/${messageId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`[Discord Delete] Discord delete response:`, data);
        return data.success;
      }
      const errText = await response.text();
      console.error(`[Discord Delete] Discord delete proxy returned status ${response.status}:`, errText);
      return false;
    } catch (error) {
      console.error('[Discord Delete] Failed to delete Discord message via proxy:', error);
      return false;
    }
  }

  console.log('[Discord Delete] Falling back to Telegram delete message for ID:', messageId);
  // Fallback to the authenticated Telegram proxy. Bot credentials stay server-side.
  try {
    const response = await proxyFetch(`${PROXY_SERVER}/telegram/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: Number(messageId) }),
    });
    const data = await response.json();
    console.log('[Discord Delete] Telegram legacy delete response:', data);
    return data.ok;
  } catch (error) {
    console.error('[Discord Delete] Failed to delete Telegram message:', error);
    return false;
  }
};


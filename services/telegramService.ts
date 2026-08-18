// Native APKs are served from a local WebView origin, so proxy calls must use
// the public Render backend instead of window.location.origin.
import { API_ORIGIN } from './apiConfig';
import { refreshSessionToken } from '../context/AuthContext';

const PROXY_SERVER = API_ORIGIN;

const proxyFetch = async (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const token = await refreshSessionToken();
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

    console.log(`[Telegram Upload] Initiating upload for file: ${fileName}, mime: ${mime}`);
    console.log(`[Telegram Upload] Target Proxy Server: ${PROXY_SERVER}`);

    const response = await proxyFetch(`${PROXY_SERVER}/telegram/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Photo: base64Data,
        fileName,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Telegram Upload] Proxy returned error status ${response.status}:`, errText);
      throw new Error(`Telegram upload returned ${response.status}`);
    }

    const data = await response.json();
    console.log('[Telegram Upload] Proxy response data:', { success: data.success, mediaType: data.mediaType });

    if (data.success && data.fileId && data.messageId) {
      // Store file_id for retrieval and message_id for Telegram deletion.
      const retValue = data.mediaType === 'pdf' || isPdf
        ? `pdf:${data.fileId}:${data.messageId}`
        : `${data.fileId}:${data.messageId}`;
      console.log(`[Telegram Upload] Success! Storing slip identifier: tg:${retValue}`);
      return retValue;
    }
    console.warn('[Telegram Upload] Proxy upload returned success=false or missing Telegram IDs');
    return null;
  } catch (error) {
    console.error('[Telegram Upload] Failed to upload via Telegram proxy:', error);
    return null;
  }
};

/**
 * Gets a temporary file URL from the bots
 */
export const getTelegramPhotoUrl = async (fileId: string): Promise<string | null> => {
    // Existing Discord records use a numeric message ID; keep read compatibility
    // while all new uploads use Telegram file_id:message_id identifiers.
    const isDiscordId = /^\d{17,20}$/.test(fileId);
    console.log(`[Receipt Fetch] Resolving fileId: "${fileId}". Is legacy Discord ID? ${isDiscordId}`);

    if (isDiscordId) {
        const proxyUrl = `${PROXY_SERVER}/discord/attachment/${encodeURIComponent(fileId)}`;
        console.log(`[Legacy Discord Fetch] Using authenticated attachment proxy: ${proxyUrl}`);
        return proxyUrl;
    }

    console.log('[Telegram Fetch] Resolving Telegram file through authenticated proxy:', fileId);
    // Resolve through the authenticated Telegram proxy; bot credentials remain server-side.
    try {
        const response = await proxyFetch(`${PROXY_SERVER}/telegram/getFileUrl?fileId=${encodeURIComponent(fileId)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.proxyUrl || data.url) {
                const proxiedUrl = data.proxyUrl?.startsWith('/')
                  ? `${PROXY_SERVER}${data.proxyUrl}`
                  : `${PROXY_SERVER}/telegram/fetchFile?url=${encodeURIComponent(data.url)}`;
                console.log(`[Telegram Fetch] Successfully resolved proxied URL:`, proxiedUrl);
                return proxiedUrl;
            }
        }
    } catch (error) {
        console.error('[Telegram Fetch] Failed to resolve file via proxy:', error);
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
  console.log(`[Receipt Delete] Request to delete messageId: "${messageId}". Is legacy Discord ID? ${isDiscordId}`);

  if (isDiscordId) {
    try {
      console.log(`[Legacy Discord Delete] Calling proxy server delete message endpoint: ${PROXY_SERVER}/discord/deleteMessage/${messageId}`);
      const response = await proxyFetch(`${PROXY_SERVER}/discord/deleteMessage/${messageId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`[Legacy Discord Delete] Discord delete response:`, data);
        return data.success;
      }
      const errText = await response.text();
      console.error(`[Legacy Discord Delete] Discord delete proxy returned status ${response.status}:`, errText);
      return false;
    } catch (error) {
      console.error('[Legacy Discord Delete] Failed to delete Discord message via proxy:', error);
      return false;
    }
  }

  console.log('[Telegram Delete] Deleting Telegram message ID:', messageId);
  // Fallback to the authenticated Telegram proxy. Bot credentials stay server-side.
  try {
    const response = await proxyFetch(`${PROXY_SERVER}/telegram/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: Number(messageId) }),
    });
    const data = await response.json();
    console.log('[Telegram Delete] Delete response:', data);
    return data.ok;
  } catch (error) {
    console.error('[Telegram Delete] Failed to delete Telegram message:', error);
    return false;
  }
};


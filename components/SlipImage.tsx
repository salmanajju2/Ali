import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getTelegramPhotoUrl } from '../services/telegramService';
import { API_ORIGIN } from '../services/apiConfig';
import { refreshSessionToken } from '../context/AuthContext';

const PROXY_SERVER = API_ORIGIN;


interface SlipImageProps {
  src: string;
  alt?: string;
  className?: string;
  onClick?: (e?: React.MouseEvent) => void;
  onUrlResolved?: (url: string) => void;
  showDownload?: boolean;
  /** PDF ko in-app modal mein dikhao (canvas renderer) */
  useIframeForPdf?: boolean;
}

// ─── Fetch PDF bytes via proxy ──────────────────────────────────────────────
const fetchPdfBytes = async (telegramUrl: string): Promise<ArrayBuffer> => {
  const proxyUrl = `${PROXY_SERVER}/telegram/fetchFile?url=${encodeURIComponent(telegramUrl)}`;
  // ✅ 15s timeout — proxy server cold start se forever hang na ho
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = new Headers();
    const token = await refreshSessionToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const resp = await fetch(proxyUrl, { headers, credentials: 'omit', signal: controller.signal });
    if (!resp.ok) throw new Error(`Proxy fetch failed: ${resp.status}`);
    return resp.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
};

const fetchAuthenticatedMedia = async (url: string): Promise<Blob> => {
  const headers = new Headers();
  const token = await refreshSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { headers, credentials: 'omit' });
  if (!response.ok) throw new Error(`Authenticated media fetch failed: ${response.status}`);
  return response.blob();
};

// ─── PDF Canvas Renderer ─────────────────────────────────────────────────────
interface PdfCanvasProps {
  pdfData: ArrayBuffer;
  className?: string;
}

const PdfCanvas: React.FC<PdfCanvasProps> = ({ pdfData, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [isRendering, setIsRendering] = useState(true);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const canvases: HTMLCanvasElement[] = [];

    const renderPdf = async () => {
      try {
        setIsRendering(true);
        setLoadError(false);

        // Dynamically import pdfjs-dist (bundled locally — works in APK!)
        const pdfjsLib = await import('pdfjs-dist');

        // ✅ Worker setup — use local worker to avoid CDN in APK
        const workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).href;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

        // Clone the ArrayBuffer using slice(0) to prevent 'detached ArrayBuffer' DOMException
        // when PDF.js worker takes ownership of the buffer.
        const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
        const pdf = await loadingTask.promise;

        if (cancelled) return;
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);

        const container = containerRef.current;
        if (!container) return;

        // Clear existing canvases
        container.innerHTML = '';

        // Render each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) break;

          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.marginBottom = '8px';
          canvas.style.borderRadius = '6px';
          canvas.style.display = 'block';
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';

          canvases.push(canvas);
          container.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport,
            } as any).promise;
          }
        }

        if (!cancelled) setIsRendering(false);
      } catch (err) {
        console.error('PDF render error:', err);
        if (!cancelled) {
          setLoadError(true);
          setIsRendering(false);
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      canvases.forEach((c) => {
        const ctx = c.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, c.width, c.height);
      });
    };
  }, [pdfData]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 bg-rose-50 dark:bg-rose-900/10 rounded-2xl">
        <svg className="w-12 h-12 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.193 2.5 1.732 2.5z" />
        </svg>
        <p className="text-rose-500 font-black text-xs uppercase tracking-widest text-center">PDF load nahi hua</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ minHeight: '300px' }}>
      {isRendering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/80 rounded-xl z-10">
          <div className="w-10 h-10 border-4 border-rose-400/30 border-t-rose-500 rounded-full animate-spin" />
          <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest">PDF Render Ho Raha Hai...</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full overflow-y-auto"
        style={{ maxHeight: '70vh', padding: '4px' }}
      />
    </div>
  );
};

// ─── Main SlipImage Component ────────────────────────────────────────────────
const SlipImage: React.FC<SlipImageProps> = ({
  src,
  alt = 'Slip',
  className = '',
  onClick,
  onUrlResolved,
  showDownload = false,
  useIframeForPdf = false,
}) => {
  const [displaySrc, setDisplaySrc]   = useState<string | null>(null);
  const [pdfBytes, setPdfBytes]       = useState<ArrayBuffer | null>(null); // for canvas render
  const [isLoading, setIsLoading]     = useState(true);
  const [hasError, setHasError]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPdfDoc, setIsPdfDoc]       = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!src) { setHasError(true); setIsLoading(false); return; }
    // The transaction list uses this compact marker for legacy inline images.
    // Its full bytes are requested only by the page when the user opens the slip.
    if (src.startsWith('lazy-slip:')) {
      setDisplaySrc(null);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    const resolveImage = async () => {
      if (!isMounted.current) return;
      setIsLoading(true);
      setHasError(false);
      setPdfBytes(null);

      let isThisPdf = false;
      let resolvedUrl = src;

      // ✅ 20s overall timeout — agar kuch bhi hang kare to loading end ho
      const overallTimer = setTimeout(() => {
        if (isMounted.current) setIsLoading(false);
      }, 20000);

      try {
        // ── Telegram tg: scheme ────────────────────────────────────────────
        if (src.startsWith('tg:')) {
          const content = src.replace(/^tg:(pdf:)?/, '');
          if (src.includes(':pdf:')) isThisPdf = true;

          // Split fileId and messageId (e.g. tg:file_id:message_id or tg:file_id)
          const parts = content.split(':');
          const fileId = parts[0];

          const url = await getTelegramPhotoUrl(fileId);
          if (!url) {
            if (isMounted.current) { setHasError(true); setIsLoading(false); }
            clearTimeout(overallTimer);
            return;
          }
          const isDiscordProxy = url.includes('/discord/attachment/');
          if (isDiscordProxy) {
            const mediaBlob = await fetchAuthenticatedMedia(url);
            if (mediaBlob.type === 'application/pdf' || src.includes(':pdf:')) {
              isThisPdf = true;
              if (isMounted.current) setPdfBytes(await mediaBlob.arrayBuffer());
            }
            objectUrl = URL.createObjectURL(mediaBlob);
            resolvedUrl = objectUrl;
            if (isMounted.current) setDownloadUrl(objectUrl);
          } else {
            resolvedUrl = url;
            if (resolvedUrl.toLowerCase().includes('.pdf')) isThisPdf = true;
            if (isMounted.current) setDownloadUrl(resolvedUrl);

            if (isThisPdf) {
              try {
                const bytes = await fetchPdfBytes(resolvedUrl);
                if (isMounted.current) setPdfBytes(bytes);
              } catch (fetchErr) {
                console.warn('PDF bytes fetch failed (proxy timeout/error):', fetchErr);
              }
            }
          }

        // ── Local base64 PDF ───────────────────────────────────────────────
        } else if (src.startsWith('data:application/pdf')) {
          isThisPdf = true;
          if (isMounted.current) setDownloadUrl(src);
          try {
            const base64 = src.split(',')[1];
            const binary = atob(base64);
            const bytes  = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            if (isMounted.current) setPdfBytes(bytes.buffer);
          } catch (_) { /* ignore */ }

        // ── Direct .pdf URL ────────────────────────────────────────────────
        } else if (src.toLowerCase().endsWith('.pdf')) {
          isThisPdf = true;
          if (isMounted.current) setDownloadUrl(src);
          try {
            const bytes = await fetchPdfBytes(src);
            if (isMounted.current) setPdfBytes(bytes);
          } catch (_) { /* ignore */ }

        } else {
          if (isMounted.current) setDownloadUrl(resolvedUrl);
        }

        if (!isMounted.current) { clearTimeout(overallTimer); return; }
        setIsPdfDoc(isThisPdf);
        setDisplaySrc(resolvedUrl);
        if (onUrlResolved) onUrlResolved(resolvedUrl);

      } catch (e) {
        console.error('SlipImage resolve error:', e);
        if (isMounted.current) setHasError(true);
      } finally {
        clearTimeout(overallTimer);
        if (isMounted.current) setIsLoading(false);
      }
    };

    resolveImage();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const handleImageClick = (e: React.MouseEvent) => {
    if (onClick) { onClick(e); } else { setIsFullscreen(true); }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100 dark:bg-gray-800 rounded-2xl border border-slate-200/50`}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Loading...</span>
        </div>
      </div>
    );
  }

  // ── Deferred legacy receipt marker ───────────────────────────────────────
  if (src.startsWith('lazy-slip:')) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 cursor-pointer`}
        onClick={onClick}
        title="Tap to load slip"
      >
        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l3 3v15H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v4h4M9 13h6m-6 4h6" />
        </svg>
        <span className="text-[8px] text-indigo-500 font-black uppercase tracking-widest">Slip</span>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (hasError || !displaySrc) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-1 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-100 cursor-pointer`}
        onClick={onClick}
      >
        <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-[9px] text-rose-400 font-black uppercase tracking-widest">No Slip</span>
      </div>
    );
  }

  // ── PDF Large Modal (useIframeForPdf=true) — canvas renderer ────────────
  if (isPdfDoc && useIframeForPdf) {
    if (pdfBytes) {
      return (
        <div
          className={`${className} flex flex-col overflow-hidden rounded-xl bg-slate-900`}
          onClick={(e) => e.stopPropagation()}
          style={{ minHeight: '60vh' }}
        >
          <PdfCanvas pdfData={pdfBytes} className="flex-1" />
        </div>
      );
    }
    // PDF bytes null hain — proxy fail hua, direct URL dikhao
    return (
      <div
        className={`${className} flex flex-col items-center justify-center gap-4 bg-slate-900 rounded-2xl`}
        style={{ minHeight: '300px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-12 h-12 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.707 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <p className="text-slate-300 text-sm font-black uppercase tracking-widest">PDF Slip</p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          Open PDF
        </a>
      </div>
    );
  }

  // ── Thumbnail (small, in list) ──────────────────────────────────────────
  return (
    <>
      <div
        className={`relative inline-block group overflow-hidden cursor-pointer ${className}`}
        onClick={handleImageClick}
      >
        {isPdfDoc ? (
          <div className="w-full h-full bg-slate-50 dark:bg-gray-900 rounded-[inherit] flex flex-col items-center justify-center p-3 border border-slate-200/50">
            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.707 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">PDF Slip</span>
          </div>
        ) : (
          <img
            src={displaySrc}
            alt={alt}
            className="w-full h-full object-contain bg-slate-50 dark:bg-gray-900 rounded-[inherit]"
            onError={() => setHasError(true)}
          />
        )}
        <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm">
            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
              {isPdfDoc ? 'View PDF' : 'Preview'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Fullscreen Modal ────────────────────────────────────────────────── */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent flex-shrink-0">
            <div className="flex flex-col">
              <h4 className="text-white font-black text-lg tracking-tight">{isPdfDoc ? 'PDF Viewer' : 'Slip Viewer'}</h4>
              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Ali Enterprises • Document</p>
            </div>
            <button
              className="p-4 bg-white/10 hover:bg-rose-500 text-white rounded-2xl transition-all shadow-lg active:scale-90"
              onClick={() => setIsFullscreen(false)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div
            className="flex-1 overflow-hidden flex flex-col p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {isPdfDoc ? (
              pdfBytes ? (
                // ✅ PDF.js canvas render — APK mein 100% kaam karta hai
                <div className="flex-1 overflow-y-auto rounded-xl bg-white">
                  <PdfCanvas pdfData={pdfBytes} className="w-full" />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    <p className="text-white/50 text-xs uppercase tracking-widest font-black">PDF Load Ho Raha Hai...</p>
                  </div>
                </div>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <img
                  src={displaySrc}
                  alt={alt}
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-xl animate-in zoom-in-95 duration-500"
                />
              </div>
            )}
          </div>

          <div className="p-6 flex justify-center gap-4 bg-gradient-to-t from-black/50 to-transparent flex-shrink-0">
            <a
              href={downloadUrl || displaySrc || ''}
              download={isPdfDoc ? 'slip.pdf' : 'slip.jpg'}
              target="_blank"
              rel="noreferrer"
              className="px-8 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-8 py-4 bg-white/10 text-white rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest border border-white/10 active:scale-95 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SlipImage;

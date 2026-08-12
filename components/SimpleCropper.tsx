import React, { useState, useRef, useEffect } from 'react';

interface SimpleCropperProps {
    imageSrc: string;
    onCropSave: (croppedDataUrl: string) => void;
    onCancel: () => void;
}

type DragMode = 'none' | 'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se';

const SimpleCropper: React.FC<SimpleCropperProps> = ({ imageSrc, onCropSave, onCancel }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>('none');
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [initialCropBox, setInitialCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [imgLoaded, setImgLoaded] = useState(false);

    const getImgRect = () => {
        if (!imageRef.current) return null;
        return imageRef.current.getBoundingClientRect();
    };

    const getPointerPos = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = getImgRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    // Initialize a default crop box when image loads so user doesn't have to draw from scratch necessarily
    useEffect(() => {
        if (imgLoaded && imageRef.current && !cropBox) {
            const rect = imageRef.current.getBoundingClientRect();
            const padding = Math.min(rect.width, rect.height) * 0.05;
            setCropBox({
                x: padding,
                y: padding,
                width: rect.width - padding * 2,
                height: rect.height - padding * 2
            });
        }
    }, [imgLoaded]);


    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
        e.preventDefault();
        e.stopPropagation();
        setDragMode(mode);
        
        const pos = getPointerPos(e);
        const rect = getImgRect();
        if (rect) {
            pos.x = Math.max(0, Math.min(pos.x, rect.width));
            pos.y = Math.max(0, Math.min(pos.y, rect.height));
        }
        setStartPos(pos);
        setInitialCropBox(cropBox ? { ...cropBox } : null);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragMode === 'none') return;
        const rect = getImgRect();
        if (!rect) return;

        const currentPos = getPointerPos(e);
        
        // Clamp pos to image boundaries
        const clampedX = Math.max(0, Math.min(currentPos.x, rect.width));
        const clampedY = Math.max(0, Math.min(currentPos.y, rect.height));
        
        const deltaX = clampedX - startPos.x;
        const deltaY = clampedY - startPos.y;

        if (dragMode === 'create') {
            const newX = Math.min(startPos.x, clampedX);
            const newY = Math.min(startPos.y, clampedY);
            const newWidth = Math.abs(clampedX - startPos.x);
            const newHeight = Math.abs(clampedY - startPos.y);
            setCropBox({ x: newX, y: newY, width: newWidth, height: newHeight });
        } else if (dragMode === 'move' && initialCropBox) {
            let newX = initialCropBox.x + deltaX;
            let newY = initialCropBox.y + deltaY;
            
            // Boundary checks for move
            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + initialCropBox.width > rect.width) newX = rect.width - initialCropBox.width;
            if (newY + initialCropBox.height > rect.height) newY = rect.height - initialCropBox.height;

            setCropBox({ ...initialCropBox, x: newX, y: newY });
        } else if (initialCropBox) {
            // Corner resizing
            let { x, y, width, height } = initialCropBox;

            if (dragMode === 'nw') {
                x = Math.min(clampedX, initialCropBox.x + initialCropBox.width - 20);
                y = Math.min(clampedY, initialCropBox.y + initialCropBox.height - 20);
                width = initialCropBox.x + initialCropBox.width - x;
                height = initialCropBox.y + initialCropBox.height - y;
            } else if (dragMode === 'ne') {
                y = Math.min(clampedY, initialCropBox.y + initialCropBox.height - 20);
                width = Math.max(20, clampedX - initialCropBox.x);
                height = initialCropBox.y + initialCropBox.height - y;
            } else if (dragMode === 'sw') {
                x = Math.min(clampedX, initialCropBox.x + initialCropBox.width - 20);
                width = initialCropBox.x + initialCropBox.width - x;
                height = Math.max(20, clampedY - initialCropBox.y);
            } else if (dragMode === 'se') {
                width = Math.max(20, clampedX - initialCropBox.x);
                height = Math.max(20, clampedY - initialCropBox.y);
            }

            setCropBox({ x, y, width, height });
        }
    };

    const handlePointerUp = () => {
        setDragMode('none');
    };

    const handleSave = () => {
        if (!imageRef.current) return;
        const img = imageRef.current;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const nativeWidth = img.naturalWidth;
        const nativeHeight = img.naturalHeight;
        
        // Since we use auto size, rect layout matches image visible rendering exactly
        const displayWidth = img.getBoundingClientRect().width;
        const displayHeight = img.getBoundingClientRect().height;

        const scaleX = nativeWidth / displayWidth;
        const scaleY = nativeHeight / displayHeight;

        if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
            const sx = cropBox.x * scaleX;
            const sy = cropBox.y * scaleY;
            const sWidth = cropBox.width * scaleX;
            const sHeight = cropBox.height * scaleY;

            canvas.width = sWidth;
            canvas.height = sHeight;

            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
        } else {
            canvas.width = nativeWidth;
            canvas.height = nativeHeight;
            ctx.drawImage(img, 0, 0, nativeWidth, nativeHeight);
        }

        // ✅ PNG = lossless = no blur, no compression artifacts (sharp text & edges)
        const croppedDataUrl = canvas.toDataURL('image/png');
        onCropSave(croppedDataUrl);
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <h3 className="text-white text-xl font-bold mb-1 tracking-tight">Crop Your Slip</h3>
            <p className="text-gray-400 text-sm mb-6 text-center max-w-xs">Drag the handles or the area to adjust the crop.</p>

            <div 
                ref={containerRef}
                className="relative bg-black rounded-lg overflow-hidden shadow-2xl touch-none select-none max-h-[70vh] max-w-full flex items-center justify-center"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerDown={(e) => {
                    if (e.target === containerRef.current) {
                        handlePointerDown(e, 'create');
                    }
                }}
            >
                {/* Base Image */}
                <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="Crop Base"
                    className="block max-w-full max-h-[70vh] w-auto h-auto pointer-events-none"
                    onLoad={() => setImgLoaded(true)}
                    draggable="false"
                />

                {/* Dark Overlay (outside crop area) & Crop Box */}
                {imgLoaded && cropBox && (
                    <div 
                        className="absolute bg-blue-500 bg-opacity-10 border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] cursor-move touch-none"
                        style={{
                            left: `${cropBox.x}px`,
                            top: `${cropBox.y}px`,
                            width: `${cropBox.width}px`,
                            height: `${cropBox.height}px`
                        }}
                        onPointerDown={(e) => handlePointerDown(e, 'move')}
                    >
                        {/* Corner Handles */}
                        <div className="absolute top-0 left-0 w-10 h-10 bg-white border-2 border-blue-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize shadow-md touch-none flex items-center justify-center" onPointerDown={(e) => handlePointerDown(e, 'nw')}>
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        </div>
                        <div className="absolute top-0 right-0 w-10 h-10 bg-white border-2 border-blue-500 rounded-full transform translate-x-1/2 -translate-y-1/2 cursor-nesw-resize shadow-md touch-none flex items-center justify-center" onPointerDown={(e) => handlePointerDown(e, 'ne')}>
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        </div>
                        <div className="absolute bottom-0 left-0 w-10 h-10 bg-white border-2 border-blue-500 rounded-full transform -translate-x-1/2 translate-y-1/2 cursor-nesw-resize shadow-md touch-none flex items-center justify-center" onPointerDown={(e) => handlePointerDown(e, 'sw')}>
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        </div>
                        <div className="absolute bottom-0 right-0 w-10 h-10 bg-white border-2 border-blue-500 rounded-full transform translate-x-1/2 translate-y-1/2 cursor-nwse-resize shadow-md touch-none flex items-center justify-center" onPointerDown={(e) => handlePointerDown(e, 'se')}>
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-4 mt-10 w-full max-w-sm">
                <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all border border-white/10 backdrop-blur-sm active:scale-95"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(59,130,246,0.5)] active:scale-95"
                >
                    {cropBox && cropBox.width > 0 ? 'Crop & Save' : 'Save Full'}
                </button>
            </div>
        </div>
    );
};

export default SimpleCropper;

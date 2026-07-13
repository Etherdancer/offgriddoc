import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import piexif from 'piexifjs';
import Tesseract from 'tesseract.js';
import { jsPDF } from 'jspdf';
import { Check, X } from 'lucide-react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface DocumentViewerProps {
  file: File;
  brushSize: number;
  tool: 'brush' | 'auto' | 'line' | 'area';
  onProcessing: (isProcessing: boolean) => void;
  exportTrigger: { trigger: number, format: string };
}

interface Point {
  x: number;
  y: number;
}

interface PendingShape {
  type: 'line' | 'area';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  status: 'drawing' | 'pending';
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  file, 
  brushSize, 
  tool,
  onProcessing,
  exportTrigger
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drawing state
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [pendingShape, setPendingShape] = useState<PendingShape | null>(null);
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);

  // History state for Undo/Redo
  const historyRef = useRef<ImageData[]>([]);
  const historyStepRef = useRef<number>(-1);

  const saveHistoryState = () => {
    if (!ctxRef.current || !canvasRef.current) return;
    const imageData = ctxRef.current.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    historyRef.current = historyRef.current.slice(0, historyStepRef.current + 1);
    historyRef.current.push(imageData);
    if (historyRef.current.length > 15) historyRef.current.shift();
    historyStepRef.current = historyRef.current.length - 1;
  };

  const undo = () => {
    if (historyStepRef.current > 0 && ctxRef.current) {
      historyStepRef.current -= 1;
      ctxRef.current.putImageData(historyRef.current[historyStepRef.current], 0, 0);
    }
  };

  const redo = () => {
    if (historyStepRef.current < historyRef.current.length - 1 && ctxRef.current) {
      historyStepRef.current += 1;
      ctxRef.current.putImageData(historyRef.current[historyStepRef.current], 0, 0);
    }
  };

  useEffect(() => {
    if (!file || !canvasRef.current || !overlayCanvasRef.current) return;

    const loadDocument = async () => {
      onProcessing(true);
      const canvas = canvasRef.current!;
      const overlayCanvas = overlayCanvasRef.current!;
      const ctx = canvas.getContext('2d');
      const oCtx = overlayCanvas.getContext('2d');
      if (!ctx || !oCtx) return;
      ctxRef.current = ctx;
      overlayCtxRef.current = oCtx;

      try {
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const page = await pdf.getPage(1); // Load first page for now
          
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          overlayCanvas.height = viewport.height;
          overlayCanvas.width = viewport.width;
          
          const renderContext = {
            canvasContext: ctx,
            viewport: viewport
          };
          await page.render(renderContext as any).promise;
          
        } else if (file.type.startsWith('image/')) {
          let imageUrl = URL.createObjectURL(file);
          
          // Strip EXIF data if jpeg
          if (file.type === 'image/jpeg') {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            await new Promise<void>((resolve) => {
              reader.onload = () => {
                const base64 = reader.result as string;
                try {
                  const stripped = piexif.remove(base64);
                  imageUrl = stripped;
                } catch (e) {
                  console.warn("Could not strip EXIF", e);
                }
                resolve();
              };
            });
          }

          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
          });
          
          canvas.width = img.width;
          canvas.height = img.height;
          overlayCanvas.width = img.width;
          overlayCanvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        }
        
        // Save initial state to history
        setTimeout(saveHistoryState, 100);
      } catch (err) {
        console.error("Error loading document:", err);
      } finally {
        onProcessing(false);
      }
    };

    loadDocument();
  }, [file]);

  // Handle Export
  useEffect(() => {
    if (exportTrigger.trigger > 0 && canvasRef.current) {
      const format = exportTrigger.format;
      const canvas = canvasRef.current;
      const filename = `redacted_${file.name.split('.')[0]}`;

      if (format === 'pdf') {
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${filename}.pdf`);
      } else {
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mimeType, 1.0);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${filename}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
  }, [exportTrigger]);

  // Draw overlay shape
  useEffect(() => {
    const oCtx = overlayCtxRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!oCtx || !overlayCanvas) return;
    
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    if (!pendingShape) return;
    
    oCtx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black for preview
    const HANDLE_SIZE = 16;
    
    if (pendingShape.type === 'area') {
      const x = Math.min(pendingShape.startX, pendingShape.endX);
      const y = Math.min(pendingShape.startY, pendingShape.endY);
      const w = Math.abs(pendingShape.endX - pendingShape.startX);
      const h = Math.abs(pendingShape.endY - pendingShape.startY);
      oCtx.fillRect(x, y, w, h);
      
      if (pendingShape.status === 'pending') {
        oCtx.fillStyle = '#10B981'; // Green handles
        const hs = HANDLE_SIZE;
        const hhs = hs / 2;
        oCtx.fillRect(pendingShape.startX - hhs, pendingShape.startY - hhs, hs, hs);
        oCtx.fillRect(pendingShape.endX - hhs, pendingShape.startY - hhs, hs, hs);
        oCtx.fillRect(pendingShape.startX - hhs, pendingShape.endY - hhs, hs, hs);
        oCtx.fillRect(pendingShape.endX - hhs, pendingShape.endY - hhs, hs, hs);
      }
    } else if (pendingShape.type === 'line') {
      const y = pendingShape.startY;
      const x = Math.min(pendingShape.startX, pendingShape.endX);
      const w = Math.abs(pendingShape.endX - pendingShape.startX);
      const h = brushSize;
      
      oCtx.fillRect(x, y - h / 2, w, h);
      
      if (pendingShape.status === 'pending') {
        oCtx.fillStyle = '#10B981';
        const hs = HANDLE_SIZE;
        const hhs = hs / 2;
        oCtx.fillRect(pendingShape.startX - hhs, y - hhs, hs, hs);
        oCtx.fillRect(pendingShape.endX - hhs, y - hhs, hs, hs);
      }
    }
  }, [pendingShape, brushSize]);

  // Draw overlay shape
  useEffect(() => {
    const oCtx = overlayCtxRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!oCtx || !overlayCanvas) return;
    
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    if (!pendingShape) return;
    
    oCtx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black for preview
    const HANDLE_SIZE = 16;
    
    if (pendingShape.type === 'area') {
      const x = Math.min(pendingShape.startX, pendingShape.endX);
      const y = Math.min(pendingShape.startY, pendingShape.endY);
      const w = Math.abs(pendingShape.endX - pendingShape.startX);
      const h = Math.abs(pendingShape.endY - pendingShape.startY);
      oCtx.fillRect(x, y, w, h);
      
      if (pendingShape.status === 'pending') {
        oCtx.fillStyle = '#10B981'; // Green handles
        const hs = HANDLE_SIZE;
        const hhs = hs / 2;
        oCtx.fillRect(pendingShape.startX - hhs, pendingShape.startY - hhs, hs, hs);
        oCtx.fillRect(pendingShape.endX - hhs, pendingShape.startY - hhs, hs, hs);
        oCtx.fillRect(pendingShape.startX - hhs, pendingShape.endY - hhs, hs, hs);
        oCtx.fillRect(pendingShape.endX - hhs, pendingShape.endY - hhs, hs, hs);
      }
    } else if (pendingShape.type === 'line') {
      const y = pendingShape.startY;
      const x = Math.min(pendingShape.startX, pendingShape.endX);
      const w = Math.abs(pendingShape.endX - pendingShape.startX);
      const h = brushSize;
      
      oCtx.fillRect(x, y - h / 2, w, h);
      
      if (pendingShape.status === 'pending') {
        oCtx.fillStyle = '#10B981';
        const hs = HANDLE_SIZE;
        const hhs = hs / 2;
        oCtx.fillRect(pendingShape.startX - hhs, y - hhs, hs, hs);
        oCtx.fillRect(pendingShape.endX - hhs, y - hhs, hs, hs);
      }
    }
  }, [pendingShape, brushSize]);

  const getFloatingToolbarStyle = (): React.CSSProperties => {
    if (!pendingShape || !overlayCanvasRef.current || !containerRef.current) return { display: 'none' };
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const parentRect = containerRef.current.getBoundingClientRect();
    
    const scaleX = rect.width / overlayCanvasRef.current.width;
    const scaleY = rect.height / overlayCanvasRef.current.height;
    
    let maxX = Math.max(pendingShape.startX, pendingShape.endX);
    let maxY = Math.max(pendingShape.startY, pendingShape.endY);
    if (pendingShape.type === 'line') maxY = pendingShape.startY + brushSize / 2;
    
    const cssX = (rect.left - parentRect.left) + maxX * scaleX;
    const cssY = (rect.top - parentRect.top) + maxY * scaleY;
    
    return {
      position: 'absolute',
      left: `${cssX}px`,
      top: `${cssY + 16}px`,
      transform: 'translateX(-100%)',
      display: 'flex', 
      gap: '0.5rem', 
      zIndex: 10, 
      background: 'var(--surface-color)', 
      padding: '0.5rem', 
      borderRadius: 'var(--radius-lg)', 
      border: '1px solid var(--border-color)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    };
  };

  // Event Handlers
  const getMousePos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const getHandleAtPos = (pos: Point) => {
    if (!pendingShape || pendingShape.status !== 'pending') return null;
    const hitArea = 20;
    
    let minX = Math.min(pendingShape.startX, pendingShape.endX);
    let maxX = Math.max(pendingShape.startX, pendingShape.endX);
    
    if (pendingShape.type === 'area') {
      const handles = {
        'nw': { x: pendingShape.startX, y: pendingShape.startY },
        'ne': { x: pendingShape.endX, y: pendingShape.startY },
        'sw': { x: pendingShape.startX, y: pendingShape.endY },
        'se': { x: pendingShape.endX, y: pendingShape.endY }
      };
      for (const [key, h] of Object.entries(handles)) {
        if (Math.abs(pos.x - h.x) <= hitArea && Math.abs(pos.y - h.y) <= hitArea) return key;
      }
      
      // Check for move (inside area)
      const minY = Math.min(pendingShape.startY, pendingShape.endY);
      const maxY = Math.max(pendingShape.startY, pendingShape.endY);
      if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) return 'move';
      
    } else if (pendingShape.type === 'line') {
      const handles = {
        'start': { x: pendingShape.startX, y: pendingShape.startY },
        'end': { x: pendingShape.endX, y: pendingShape.startY }
      };
      for (const [key, h] of Object.entries(handles)) {
        if (Math.abs(pos.x - h.x) <= hitArea && Math.abs(pos.y - h.y) <= hitArea) return key;
      }
      
      // Check for move (inside line)
      const y = pendingShape.startY;
      if (pos.x >= minX && pos.x <= maxX && pos.y >= y - brushSize && pos.y <= y + brushSize) return 'move';
    }
    return null;
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);

    if (pendingShape?.status === 'pending') {
      const handle = getHandleAtPos(pos);
      if (handle) {
        setResizingHandle(handle);
        lastPoint.current = pos;
        return;
      }
      // If clicked outside, let it stay pending
      if (tool === 'area' || tool === 'line') {
         // Optionally, clicking outside could start a new shape, but let's just ignore to prevent accidental loss
         return;
      }
    }

    if (tool === 'brush') {
      isDrawing.current = true;
      lastPoint.current = pos;
      draw(e);
    } else if (tool === 'area' || tool === 'line') {
      setPendingShape({
        type: tool,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
        status: 'drawing'
      });
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);

    if (resizingHandle && pendingShape) {
      const dx = pos.x - lastPoint.current!.x;
      const dy = pos.y - lastPoint.current!.y;

      setPendingShape(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        
        if (resizingHandle === 'move') {
          next.startX += dx;
          next.endX += dx;
          next.startY += dy;
          next.endY += dy;
        } else if (prev.type === 'area') {
          if (resizingHandle.includes('n')) next.startY = pos.y;
          if (resizingHandle.includes('s')) next.endY = pos.y;
          if (resizingHandle.includes('w')) next.startX = pos.x;
          if (resizingHandle.includes('e')) next.endX = pos.x;
        } else if (prev.type === 'line') {
          if (resizingHandle === 'start') {
             next.startX = pos.x;
             next.startY = pos.y; 
          }
          if (resizingHandle === 'end') {
             next.endX = pos.x;
             next.startY = pos.y; 
          }
        }
        return next;
      });
      lastPoint.current = pos;
      return;
    }

    if (pendingShape?.status === 'drawing') {
      setPendingShape(prev => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
      return;
    }

    if (tool === 'brush' && isDrawing.current && ctxRef.current && lastPoint.current) {
      const ctx = ctxRef.current;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = '#000000';

      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      
      lastPoint.current = pos;
    }
  };

  const stopDrawing = () => {
    if (isDrawing.current && tool === 'brush') {
      saveHistoryState();
    }
    isDrawing.current = false;
    lastPoint.current = null;
    setResizingHandle(null);
    if (pendingShape?.status === 'drawing') {
      setPendingShape(prev => prev ? { ...prev, status: 'pending' } : null);
    }
  };

  const confirmShape = () => {
    if (!pendingShape || !ctxRef.current) return;
    const ctx = ctxRef.current;
    ctx.fillStyle = '#000000';
    if (pendingShape.type === 'area') {
      const x = Math.min(pendingShape.startX, pendingShape.endX);
      const y = Math.min(pendingShape.startY, pendingShape.endY);
      const w = Math.abs(pendingShape.endX - pendingShape.startX);
      const h = Math.abs(pendingShape.endY - pendingShape.startY);
      ctx.fillRect(x, y, w, h);
    } else if (pendingShape.type === 'line') {
      const x = Math.min(pendingShape.startX, pendingShape.endX);
      const w = Math.abs(pendingShape.endX - pendingShape.startX);
      ctx.fillRect(x, pendingShape.startY - brushSize / 2, w, brushSize);
    }
    setPendingShape(null);
    saveHistoryState();
  };

  const cancelShape = () => setPendingShape(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelShape();
      if (e.key === 'Enter') confirmShape();
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // OCR Auto Redact
  const runAutoRedact = async () => {
    if (!canvasRef.current || !ctxRef.current) return;
    onProcessing(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const result: any = await Tesseract.recognize(
        dataUrl,
        'eng',
        { logger: m => console.log(m) }
      );
      const words = result.data.words;
      const ctx = ctxRef.current;
      
      const SSN_REGEX = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/;
      
      words.forEach((word: any) => {
        if (SSN_REGEX.test(word.text)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(word.bbox.x0, word.bbox.y0, word.bbox.x1 - word.bbox.x0, word.bbox.y1 - word.bbox.y0);
        }
      });
      saveHistoryState();
    } catch (e) {
      console.error(e);
    } finally {
      onProcessing(false);
    }
  };

  useEffect(() => {
    if (tool === 'auto') {
      runAutoRedact();
    }
  }, [tool]);

  return (
    <div 
      ref={containerRef}
      className="canvas-layer"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          position: 'absolute'
        }}
      />
      <canvas
        ref={overlayCanvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          position: 'absolute',
          cursor: pendingShape?.status === 'pending' ? 'default' : 'crosshair',
          zIndex: 5
        }}
      />
      
      {pendingShape?.status === 'pending' && (
        <div style={getFloatingToolbarStyle()}>
          <button 
            onClick={confirmShape} 
            className="btn" 
            style={{ padding: '0.5rem 1rem', background: 'var(--primary-color)' }} 
            title="Confirm (Enter)"
          >
            <Check size={20} />
          </button>
          <button 
            onClick={cancelShape} 
            className="btn btn-secondary" 
            style={{ padding: '0.5rem 1rem' }} 
            title="Cancel (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

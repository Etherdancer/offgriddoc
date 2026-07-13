import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import piexif from 'piexifjs';
import Tesseract from 'tesseract.js';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface DocumentViewerProps {
  file: File;
  brushSize: number;
  tool: 'brush' | 'auto';
  onProcessing: (isProcessing: boolean) => void;
  exportTrigger: number;
}

interface Point {
  x: number;
  y: number;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  file, 
  brushSize, 
  tool,
  onProcessing,
  exportTrigger
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drawing state
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (!file || !canvasRef.current) return;

    const loadDocument = async () => {
      onProcessing(true);
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctxRef.current = ctx;

      try {
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(arrayBuffer as any).promise;
          const page = await pdf.getPage(1); // Load first page for now
          
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
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
          ctx.drawImage(img, 0, 0);
        }
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
    if (exportTrigger > 0 && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `redacted_${file.name.split('.')[0]}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [exportTrigger]);

  // Drawing Handlers
  const getMousePos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
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

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool !== 'brush') return;
    e.preventDefault();
    isDrawing.current = true;
    const pos = getMousePos(e);
    lastPoint.current = pos;
    draw(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!isDrawing.current || !ctxRef.current || tool !== 'brush') return;
    e.preventDefault();
    
    const currentPos = getMousePos(e);
    const ctx = ctxRef.current;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = '#000000'; // Blackout color

    ctx.beginPath();
    if (lastPoint.current) {
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
    }
    
    lastPoint.current = currentPos;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    lastPoint.current = null;
  };

  // OCR Auto Redact
  const runAutoRedact = async () => {
    if (!canvasRef.current) return;
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
      if (!ctx) return;
      
      const SSN_REGEX = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/;
      
      words.forEach((word: any) => {
        if (SSN_REGEX.test(word.text)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(word.bbox.x0, word.bbox.y0, word.bbox.x1 - word.bbox.x0, word.bbox.y1 - word.bbox.y0);
        }
      });
      
    } catch (e) {
      console.error(e);
    } finally {
      onProcessing(false);
    }
  };

  // Expose auto redact to parent via ref or just listen to tool changes? 
  // For simplicity, we can watch tool change to 'auto' to trigger, then revert to 'brush'.
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
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

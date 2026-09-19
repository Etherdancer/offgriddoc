import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import piexif from 'piexifjs';
import Tesseract from 'tesseract.js';
import { jsPDF } from 'jspdf';
import { Check, X } from 'lucide-react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface DocumentViewerRef {
  undo: () => void;
  redo: () => void;
}

interface DocumentViewerProps {
  file: File | null;
  brushSize: number;
  tool: 'brush' | 'auto' | 'line' | 'area';
  exportTrigger: { trigger: number, format: string };
  ocrLanguage: string;
  autoRedactTrigger: number;
  onProcessing: (isProcessing: boolean) => void;
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

export const DocumentViewer = forwardRef<DocumentViewerRef, DocumentViewerProps>(({ 
  file, 
  brushSize, 
  tool,
  onProcessing,
  exportTrigger,
  ocrLanguage,
  autoRedactTrigger
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pageCount, setPageCount] = useState(0);
  
  // Drawing state
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [pendingShape, setPendingShape] = useState<PendingShape | null>(null);
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);
  const [debugText, setDebugText] = useState<string | null>(null);
  const saveTimeoutRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  // History state for Undo/Redo
  interface HistoryState {
    imageData: ImageData;
    pendingShape: PendingShape | null;
  }
  const historyRef = useRef<HistoryState[]>([]);
  const historyStepRef = useRef<number>(-1);
  const pdfDocCacheRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // We use a ref for pending shape to read it synchronously in event handlers
  const pendingShapeRef = useRef<PendingShape | null>(null);

  const updatePendingShape = (updater: PendingShape | null | ((prev: PendingShape | null) => PendingShape | null)) => {
    setPendingShape(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pendingShapeRef.current = next;
      return next;
    });
  };

  const saveHistoryState = (updateCanvas: boolean = true) => {
    if (!ctxRef.current || !canvasRef.current) return;
    
    let newImageData;
    if (updateCanvas || historyRef.current.length === 0) {
      newImageData = ctxRef.current.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    } else {
      newImageData = historyRef.current[historyStepRef.current].imageData;
    }

    historyRef.current = historyRef.current.slice(0, historyStepRef.current + 1);
    
    const lastState = historyRef.current[historyRef.current.length - 1];
    if (lastState && !updateCanvas && !lastState.pendingShape && !pendingShapeRef.current) {
      return; // Skip identical empty states
    }

    historyRef.current.push({
      imageData: newImageData,
      pendingShape: pendingShapeRef.current ? { ...pendingShapeRef.current } : null
    });
    
    if (historyRef.current.length > 30) historyRef.current.shift();
    historyStepRef.current = historyRef.current.length - 1;
  };

  const undo = () => {
    if (historyStepRef.current > 0 && ctxRef.current) {
      historyStepRef.current -= 1;
      const state = historyRef.current[historyStepRef.current];
      ctxRef.current.putImageData(state.imageData, 0, 0);
      updatePendingShape(state.pendingShape);
    }
  };

  const redo = () => {
    if (historyStepRef.current < historyRef.current.length - 1 && ctxRef.current) {
      historyStepRef.current += 1;
      const state = historyRef.current[historyStepRef.current];
      ctxRef.current.putImageData(state.imageData, 0, 0);
      updatePendingShape(state.pendingShape);
    }
  };

  useImperativeHandle(ref, () => ({
    undo,
    redo
  }));

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
          pdfDocCacheRef.current = pdf;
          setPageCount(pdf.numPages);
          const page = await pdf.getPage(1); // Load first page for now
          
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          overlayCanvas.height = viewport.height;
          overlayCanvas.width = viewport.width;
          
          // Fill with white background (crucial for OCR and PDF rendering)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          const renderContext = {
            canvasContext: ctx,
            viewport: viewport
          };
          await page.render(renderContext as any).promise;
          
        } else if (file.type.startsWith('image/')) {
          const originalBlobUrl = URL.createObjectURL(file);
          let imageUrl = originalBlobUrl;
          
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
          
          // Fill with white background to prevent transparent-PNG OCR failures
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          URL.revokeObjectURL(originalBlobUrl);
        }
        
        // Save initial state to history
        setTimeout(() => saveHistoryState(true), 100);
      } catch (err) {
        console.error("Error loading document:", err);
      } finally {
        onProcessing(false);
      }
    };

    loadDocument();
  }, [file, onProcessing]);

  // Handle Export
  useEffect(() => {
    if (exportTrigger.trigger > 0 && canvasRef.current) {
      const format = exportTrigger.format;
      const canvas = canvasRef.current;
      const filename = `redacted_${file?.name?.split('.')[0] || 'document'}`;

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
  }, [exportTrigger, file]);

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
      updatePendingShape({
        type: tool,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
        status: 'drawing'
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (overlayCanvasRef.current) {
      if (pendingShapeRef.current?.status === 'pending' && !resizingHandle) {
        const pos = getMousePos(e);
        const handle = getHandleAtPos(pos);
        if (handle === 'move') {
          overlayCanvasRef.current.style.cursor = 'move';
        } else if (handle === 'nw' || handle === 'se') {
          overlayCanvasRef.current.style.cursor = 'nwse-resize';
        } else if (handle === 'ne' || handle === 'sw') {
          overlayCanvasRef.current.style.cursor = 'nesw-resize';
        } else if (handle === 'start' || handle === 'end') {
          overlayCanvasRef.current.style.cursor = 'ew-resize';
        } else {
          overlayCanvasRef.current.style.cursor = 'default';
        }
      } else if (!pendingShapeRef.current || pendingShapeRef.current.status !== 'pending') {
         overlayCanvasRef.current.style.cursor = 'crosshair';
      }
    }

    if (isDrawing.current || resizingHandle || pendingShapeRef.current?.status === 'drawing') {
      draw(e);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);

    if (resizingHandle && pendingShapeRef.current) {
      const dx = pos.x - lastPoint.current!.x;
      const dy = pos.y - lastPoint.current!.y;

      updatePendingShape(prev => {
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

    if (pendingShapeRef.current?.status === 'drawing') {
      updatePendingShape(prev => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
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
    let didChangeShape = false;
    
    if (isDrawing.current && tool === 'brush') {
      saveHistoryState(true);
    }
    
    if (resizingHandle) {
      didChangeShape = true;
    }

    if (pendingShapeRef.current?.status === 'drawing') {
      updatePendingShape(prev => prev ? { ...prev, status: 'pending' } : null);
      didChangeShape = true;
    }
    
    isDrawing.current = false;
    lastPoint.current = null;
    setResizingHandle(null);
    
    if (didChangeShape && tool !== 'brush') {
      // Small timeout to allow state to flush to pendingShapeRef
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveHistoryState(false), 10);
    }
  };

  const confirmShape = () => {
    if (!pendingShapeRef.current || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const shape = pendingShapeRef.current;
    ctx.fillStyle = '#000000';
    if (shape.type === 'area') {
      const x = Math.min(shape.startX, shape.endX);
      const y = Math.min(shape.startY, shape.endY);
      const w = Math.abs(shape.endX - shape.startX);
      const h = Math.abs(shape.endY - shape.startY);
      ctx.fillRect(x, y, w, h);
    } else if (shape.type === 'line') {
      const x = Math.min(shape.startX, shape.endX);
      const w = Math.abs(shape.endX - shape.startX);
      ctx.fillRect(x, shape.startY - brushSize / 2, w, brushSize);
    }
    updatePendingShape(null);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveHistoryState(true), 10);
  };

  const cancelShape = () => {
    updatePendingShape(null);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveHistoryState(false), 10);
  };

  const confirmShapeRef = useRef(confirmShape);
  const cancelShapeRef = useRef(cancelShape);
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);

  useEffect(() => {
    confirmShapeRef.current = confirmShape;
    cancelShapeRef.current = cancelShape;
    undoRef.current = undo;
    redoRef.current = redo;
  }, [confirmShape, cancelShape, undo, redo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelShapeRef.current();
      if (e.key === 'Enter') confirmShapeRef.current();
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      }
      if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

    // OCR Auto Redact
  const runAutoRedact = async () => {
    if (!canvasRef.current || !ctxRef.current || !file) return;
    onProcessing(true);
    try {
      const ctx = ctxRef.current;
      let redactedCount = 0;
      let dbg = `=== AUTO REDACT DEBUG LOG ===\n\nFile Type: ${file.type}\n`;

      // Sensitive-data patterns
      const patterns = [
        /(?:\+|00)[\d\s().,-]{7,20}\d/g,           // International phone (e.g. +385 955243014)
        /\b\d[\d\s().,-]{6,18}\d\b/g,              // Local long-digit sequences
        /\b[A-Za-z0-9._%+-]+\s*[@&]\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/gi, // Email (& = OCR misread of @)
        /\b\d{1,2}\s*[.\/\-]\s*\d{1,2}\s*[.\/\-]\s*\d{2,4}\b/g,     // Dates DD/MM/YYYY etc (with optional spaces from OCR)
        /\b\d{5,}\b/g,                              // Postal codes / long numeric IDs
        /\b[A-Za-z]{1,3}\s*\d{6,}\b/gi,            // Alphanumeric IDs (passport, licence)
        
        // Place of birth
        /\b(?:mjesto ro[đd]enja|place of birth|birthplace|geburtsort|lieu de naissance|lugar de nacimiento|luogo di nascita|naturalidade|local de nascimento|locul na[sș]terii|születési hely|födelseort|fødested|syntymäpaikka|sünnikoht|dzimšanas vieta|gimimo vieta|τόπος γέννησης|doğum yeri|مكان الميلاد|محل تولد|مקום לידה|जन्म स्थान|出生地|출생지|место рождения|місце народження|miejsce urodzenia|místo narození|miesto narodenia|kraj rojstva|место на раѓање)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
        
        // Citizenship / Nationality
        /\b(?:dr[žz]avljanstvo|nacionalnost|citizenship|nationality|staatsangeh[öo]rigkeit|nationalit[ée]|nacionalidad|cittadinanza|nacionalidade|cidadania|cet[ăa]țenie|naționalitate|állampolgárság|nemzetiség|medborgarskap|statsborgerskap|kansalaisuus|uyruk|vatandaşlık|ιθαγένεια|υπηκοότητα|الجنسية|ملیت|אזרחות|राष्ट्रीयता|国籍|국적|гражданство|национальность|громадянство|національність|obywatelstwo|narodowość|občanství|státní příslušnost|štátna príslušnosť|државјанство)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
        
        // Gender / Sex
        /\b(?:spol|gender|sex|geschlecht|sexe|g[ée]nero|sesso|geslacht|płeć|pohlaví|пол|cinsiyet|性别|性別|성별|kjønn|kön|sukupuoli|gènere|جنس|מין|लिंग|stati)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
        
        // Name
        /\b(?:ime i prezime|full name|name|nom|nombre|nome|first name|last name|ime|prezime|navn|namn|nimi|isim|ad|όνομα|الاسم|نام|שם|नाम|姓名|名前|이름|имя|ім'я|imię|jméno|meno|imi[ęe] i nazwisko)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
        
        // Address / Residence
        /\b(?:adresa|address|adresse|direcci[óo]n|indirizzo|prebivali[šs]te|boravi[šs]te|residence|domicile|residência|morada|woonplaats|adres|zamieszkanie|место жительства|ikametgah|地址|住所|주소|osoite|cím|διεύθυνση|العنوان|آدرس|כתובת|पता|адрес|адреса)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi
      ];

      const matchPatterns = (text: string): boolean =>
        patterns.some(p => { const reg = new RegExp(p.source, p.flags); return reg.test(text); });

      // Helper to robustly extract bounding boxes from Tesseract result (fixes Croatian language bug)
      const processTesseractResult = (result: any, sX: number, sY: number) => {
        let count = 0;
        const words: any[] = result?.data?.words || [];
        const lines: any[] = result?.data?.lines || [];
        const tsv = result?.data?.tsv || '';

        // Tesseract.js v5+ dropped words/lines from the top level, extract from blocks
        if (words.length === 0 && result?.data?.blocks) {
          result.data.blocks.forEach((b: any) => {
            b.paragraphs?.forEach((p: any) => {
              p.lines?.forEach((l: any) => {
                lines.push(l);
                l.words?.forEach((w: any) => words.push(w));
              });
            });
          });
        }

        // 1. Strategy A: Word-level boxes (most precise)
        if (words.length > 0) {
          let text = '';
          const charToWord: number[] = [];
          words.forEach((w: any, i: number) => {
            const start = text.length;
            text += w.text + ' ';
            for (let c = start; c < text.length; c++) charToWord[c] = i;
          });
          const wordsToRedact = new Set<number>();
          patterns.forEach(pattern => {
            const p = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = p.exec(text)) !== null) {
              let val = match[1] || match[0];
              val = val.trim(); // remove leading/trailing space from value
              if (!val) continue;
              const matchStart = match.index + match[0].lastIndexOf(val);
              const matchEnd = matchStart + val.length - 1;
              const si = charToWord[matchStart];
              const ei = charToWord[matchEnd];
              if (si !== undefined && ei !== undefined)
                for (let i = si; i <= ei; i++) wordsToRedact.add(i);
            }
          });
          wordsToRedact.forEach(idx => {
            const w = words[idx];
            if (w?.bbox) {
              ctx.fillStyle = '#000000';
              ctx.fillRect(w.bbox.x0 * sX, w.bbox.y0 * sY, (w.bbox.x1 - w.bbox.x0) * sX, (w.bbox.y1 - w.bbox.y0) * sY);
              count++;
            }
          });
        }

        // 2. Strategy B: Line-level boxes
        if (count === 0 && lines.length > 0) {
          lines.forEach((line: any) => {
            if (line?.text && line?.bbox && matchPatterns(line.text)) {
              ctx.fillStyle = '#000000';
              ctx.fillRect(line.bbox.x0 * sX, line.bbox.y0 * sY, (line.bbox.x1 - line.bbox.x0) * sX, (line.bbox.y1 - line.bbox.y0) * sY);
              count++;
            }
          });
        }

        // 3. Strategy C: TSV Parsing (Fixes Tesseract WASM bug for `hrv` where words/lines are empty)
        if (count === 0 && tsv) {
          const rows = tsv.trim().split('\n').slice(1);
          const tsvWords: any[] = [];
          for (const row of rows) {
            const cols = row.split('\t');
            if (cols.length >= 12 && parseInt(cols[0]) === 5 && cols[11]?.trim()) {
              tsvWords.push({
                text: cols[11].trim(),
                left: parseInt(cols[6]), top: parseInt(cols[7]),
                width: parseInt(cols[8]), height: parseInt(cols[9])
              });
            }
          }
          if (tsvWords.length > 0) {
            let tsvText = '';
            const charToTsvWord: number[] = [];
            tsvWords.forEach((w, i) => {
              const start = tsvText.length;
              tsvText += w.text + ' ';
              for (let c = start; c < tsvText.length; c++) charToTsvWord[c] = i;
            });
            const tsvToRedact = new Set<number>();
            patterns.forEach(pattern => {
              const p = new RegExp(pattern.source, pattern.flags);
              let match;
              while ((match = p.exec(tsvText)) !== null) {
                let val = match[1] || match[0];
                val = val.trim();
                if (!val) continue;
                const matchStart = match.index + match[0].lastIndexOf(val);
                const matchEnd = matchStart + val.length - 1;
                const si = charToTsvWord[matchStart];
                const ei = charToTsvWord[matchEnd];
                if (si !== undefined && ei !== undefined)
                  for (let i = si; i <= ei; i++) tsvToRedact.add(i);
              }
            });
            tsvToRedact.forEach(idx => {
              const w = tsvWords[idx];
              ctx.fillStyle = '#000000';
              ctx.fillRect(w.left * sX, w.top * sY, w.width * sX, w.height * sY);
              count++;
            });
          }
        }
        return count;
      };

      if (file.type === 'application/pdf') {
        // ── Strategy 1: PDF.js text extraction ──────────────────────────────
        // Text-based PDFs (Word, Europass, etc.) have embedded text — no OCR needed.
        // Falls back to Tesseract only if the PDF has no embedded text (scanned image).
        const pdfDoc = pdfDocCacheRef.current;
        if (!pdfDoc) throw new Error("PDF Document not found in cache");
        const page = await pdfDoc.getPage(1);

        // Build a viewport that matches the display canvas pixel-for-pixel
        const baseVp = page.getViewport({ scale: 1 });
        const displayScale = canvasRef.current.width / baseVp.width;
        const displayVp = page.getViewport({ scale: displayScale });

        const textContent = await page.getTextContent();
        const items: any[] = (textContent.items as any[]).filter((it: any) => it.str?.trim());
        dbg += `PDF.js Extracted Text Items: ${items.length}\n`;

        if (items.length > 3) {
          // Build a single searchable string, mapping char positions → item index
          let searchableText = '';
          const charToItem: number[] = [];
          items.forEach((item: any, i: number) => {
            const start = searchableText.length;
            searchableText += item.str + ' ';
            for (let c = start; c < searchableText.length; c++) charToItem[c] = i;
          });
          dbg += `PDF.js Searchable Text length: ${searchableText.length}\n`;
          dbg += `PDF.js Preview: "${searchableText.substring(0, 200)}..."\n`;

          // Find all sensitive pattern matches
          const itemsToRedact = new Set<number>();
          patterns.forEach(pattern => {
            const p = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = p.exec(searchableText)) !== null) {
              let val = match[1] || match[0];
              val = val.trim();
              if (!val) continue;
              const matchStart = match.index + match[0].lastIndexOf(val);
              const matchEnd = matchStart + val.length - 1;
              const si = charToItem[matchStart];
              const ei = charToItem[matchEnd];
              if (si !== undefined && ei !== undefined)
                for (let i = si; i <= ei; i++) itemsToRedact.add(i);
            }
          });

          // ── Structural detection: personal-info zone label→value pairs ──────
          // Works for ANY language. In every CV, personal info appears before
          // the first ALL_CAPS section header (e.g. EDUCATION, WORK EXPERIENCE).
          // Within that zone we redact the value items that follow label items
          // (items whose text ends with ":").

          // 1. Find the boundary of the personal section
          let personalSectionEnd = items.length;
          let labelSeen = false;
          for (let si = 3; si < items.length; si++) {
            const t = items[si].str.trim();
            if (/:\s*$/.test(t)) labelSeen = true;
            // Section header: all uppercase, 4+ chars, no digits (only break AFTER seeing at least one label)
            if (
              labelSeen &&
              t.length >= 4 &&
              t === t.toUpperCase() &&
              /[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ]/.test(t) &&
              !/\d/.test(t)
            ) {
              personalSectionEnd = si;
              break;
            }
          }


          // 2. Redact value items that follow labels inside the personal section
          let pi = 0;
          while (pi < personalSectionEnd) {
            const labelText = items[pi].str.trim();
            if (/:\s*$/.test(labelText)) {
              // This item is a label — consume following value items
              pi++;
              while (pi < personalSectionEnd) {
                const valText = items[pi].str.trim();
                if (!valText) { pi++; continue; }
                // Stop when we reach the next label
                if (/:\s*$/.test(valText)) break;
                // Redact this value item
                itemsToRedact.add(pi);
                pi++;
              }
            } else {
              pi++;
            }
          }

          // Draw redaction rectangles using PDF viewport coordinate transform
          itemsToRedact.forEach(idx => {
            const item: any = items[idx];
            if (!item.transform) return;
            const [, , , d, tx, ty] = item.transform;

            // Convert PDF user-space baseline point → canvas pixel (y flipped)
            const [cx, cy] = displayVp.convertToViewportPoint(tx, ty);
            const fontH = Math.abs(d) * displayScale;   // approx cap height in canvas px
            const textW = (item.width || 30) * displayScale;

            ctx.fillStyle = '#000000';
            // cy is the baseline; box covers ascenders above and descenders below
            ctx.fillRect(cx - 1, cy - fontH * 1.1, textW + 4, fontH * 1.4);
            redactedCount++;
          });
          dbg += `PDF.js Regex matched items: ${itemsToRedact.size}\n`;
        }

        if (redactedCount === 0) {
          dbg += `\n[FALLBACK] PDF.js yielded 0 redactions. Falling back to OCR...\n`;
          // Scanned PDF (or PDF with garbage embedded text) — fall back to Tesseract OCR
          // We use the already-rendered main canvas to guarantee we feed Tesseract exactly what the user sees
          const dataUrl = canvasRef.current.toDataURL('image/png');
          const langStr = ocrLanguage === 'eng' ? 'eng' : `${ocrLanguage}+eng`;
          dbg += `Tesseract Language: ${langStr}\n`;
          const worker = await Tesseract.createWorker(langStr, 1, { logger: m => console.log(m) });
          const result: any = await worker.recognize(dataUrl, {}, { blocks: true });
          await worker.terminate();
          
          let wordCount = result?.data?.words?.length || 0;
          if (wordCount === 0 && result?.data?.blocks) {
             result.data.blocks.forEach((b: any) => b.paragraphs?.forEach((p: any) => p.lines?.forEach((l: any) => wordCount += l.words?.length || 0)));
          }
          
          dbg += `Tesseract Extracted Text: "${(result?.data?.text || '').substring(0, 200)}..."\n`;
          dbg += `Tesseract Words array length: ${wordCount}\n`;
          // Since dataUrl is generated from canvasRef, the scale factors are exactly 1
          redactedCount += processTesseractResult(result, 1, 1);
        }

      } else {
        // ── Strategy 2: Image files → Tesseract OCR ─────────────────────────
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target!.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const langStr = ocrLanguage === 'eng' ? 'eng' : `${ocrLanguage}+eng`;
        dbg += `Tesseract Language: ${langStr}\n`;
        const worker = await Tesseract.createWorker(langStr, 1, { logger: m => console.log(m) });
        const result: any = await worker.recognize(dataUrl, {}, { blocks: true });
        await worker.terminate();
        
        let wordCount = result?.data?.words?.length || 0;
        if (wordCount === 0 && result?.data?.blocks) {
           result.data.blocks.forEach((b: any) => b.paragraphs?.forEach((p: any) => p.lines?.forEach((l: any) => wordCount += l.words?.length || 0)));
        }
        
        dbg += `Tesseract Extracted Text: "${(result?.data?.text || '').substring(0, 200)}..."\n`;
        dbg += `Tesseract Words array length: ${wordCount}\n`;
        const sX = canvasRef.current.width / (result?.data?.imageWidth || canvasRef.current.width);
        const sY = canvasRef.current.height / (result?.data?.imageHeight || canvasRef.current.height);
        redactedCount += processTesseractResult(result, sX, sY);
      }

      if (redactedCount > 0) {
        saveHistoryState(true);
      } else {
        setDebugText(dbg);
      }
    } catch (e: any) {
      console.error(e);
      alert(`An error occurred during Auto-Redact: ${e.message || String(e)}`);
    } finally {
      onProcessing(false);
    }
  };

  useEffect(() => {
    if (autoRedactTrigger > 0) {
      runAutoRedact();
    }
  }, [autoRedactTrigger]);

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
      {pageCount > 1 && (
        <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', zIndex: 10, fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          Only Page 1 of {pageCount} is editable
        </div>
      )}
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
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={handleMouseMove}
        onTouchEnd={stopDrawing}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          position: 'absolute',
          cursor: 'crosshair',
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

      {debugText && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem'
        }}>
          <div style={{
            background: 'var(--bg-card)', padding: '2rem', borderRadius: '12px',
            width: '100%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '1rem'
          }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Auto-Redact Debug Log</h3>
            <textarea 
              readOnly 
              value={debugText} 
              style={{
                flex: 1, width: '100%', background: '#111', color: '#0f0', 
                fontFamily: 'monospace', padding: '1rem', border: 'none', borderRadius: '8px',
                resize: 'none', outline: 'none', whiteSpace: 'pre-wrap'
              }}
            />
            <button 
              onClick={() => setDebugText(null)}
              className="btn" 
              style={{ background: 'var(--primary-color)', alignSelf: 'flex-end', padding: '0.75rem 2rem' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

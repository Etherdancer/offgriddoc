import React, { useState, useEffect } from 'react';
import { Upload, Download, ShieldAlert, Droplet, Search } from 'lucide-react';
import { DocumentViewer } from './components/DocumentViewer';
import './index.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [tool, setTool] = useState<'brush' | 'auto'>('brush');
  const [exportTrigger, setExportTrigger] = useState({ trigger: 0, format: 'pdf' });
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png' | 'jpeg'>('pdf');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (file) {
      if (file.type === 'application/pdf') {
        setExportFormat('pdf');
      } else if (file.type === 'image/jpeg') {
        setExportFormat('jpeg');
      } else {
        setExportFormat('png');
      }
    }
  }, [file]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const triggerExport = () => {
    setExportTrigger(prev => ({ trigger: prev.trigger + 1, format: exportFormat }));
  };

  const handleAutoRedact = () => {
    setTool('auto');
    // We revert to brush after a short delay so the tool can be clicked again later
    setTimeout(() => setTool('brush'), 500);
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo-section">
          <div className="logo-icon">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>OffGridDoc</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Local Document Redactor</p>
          </div>
        </div>
        <div className="status-badge">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick} 
              className="btn" 
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', gap: '0.25rem' }}
            >
              <Download size={14} /> Install App
            </button>
          )}
          <div className="status-dot"></div>
          Offline Ready
        </div>
      </header>

      <main>
        {!file ? (
          <div 
            className="dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <Upload className="dropzone-icon" />
            <h2 className="dropzone-title">Upload a document</h2>
            <p className="dropzone-subtitle">
              Drag & drop a PDF or Image here to redact and strip metadata securely. All processing happens locally on your device.
            </p>
            <input 
              type="file" 
              id="file-upload" 
              style={{ display: 'none' }}
              accept=".pdf,image/*"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="glass-panel editor-container">
            <div className="toolbar">
              <div className="tools-group">
                <button 
                  className={`tool-btn ${tool === 'brush' ? 'active' : ''}`} 
                  onClick={() => setTool('brush')}
                  title="Brush"
                >
                  <Droplet size={20} />
                </button>
                <button 
                  className="tool-btn" 
                  onClick={handleAutoRedact}
                  disabled={isProcessing}
                  title="Auto Redact SSNs"
                >
                  <Search size={20} />
                </button>
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 8px' }}></div>
                <input 
                  type="range" 
                  min="5" max="50" 
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="range-slider" 
                  title="Brush Size" 
                />
              </div>
              <div className="tools-group">
                <select 
                  value={exportFormat} 
                  onChange={(e) => setExportFormat(e.target.value as any)}
                  className="tool-btn"
                  style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  title="Export Format"
                >
                  <option value="pdf">PDF</option>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
                <button 
                  className="btn" 
                  onClick={triggerExport} 
                  disabled={isProcessing}
                  title="Export securely"
                >
                  <Download size={18} /> Export
                </button>
                <button className="btn btn-secondary" onClick={() => setFile(null)}>
                  Cancel
                </button>
              </div>
            </div>
            
            <div className="canvas-wrapper">
              {isProcessing && (
                <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.7)', padding: '2rem', borderRadius: '1rem' }}>
                  <div className="loader"></div>
                  <span>Processing...</span>
                </div>
              )}
              <DocumentViewer 
                file={file} 
                brushSize={brushSize}
                tool={tool}
                onProcessing={setIsProcessing}
                exportTrigger={exportTrigger}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

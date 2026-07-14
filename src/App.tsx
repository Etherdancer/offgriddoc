import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, ShieldAlert, Droplet, Wand2, Minus, Square, Undo, Redo } from 'lucide-react';
import { InstallApp } from './components/InstallApp';
import { DocumentViewer, type DocumentViewerRef } from './components/DocumentViewer';
import './index.css';

const OCR_LANGUAGES = [
  { code: 'afr', name: 'Afrikaans' },
  { code: 'amh', name: 'Amharic' },
  { code: 'ara', name: 'Arabic' },
  { code: 'asm', name: 'Assamese' },
  { code: 'aze', name: 'Azerbaijani' },
  { code: 'aze_cyrl', name: 'Azerbaijani - Cyrillic' },
  { code: 'bel', name: 'Belarusian' },
  { code: 'ben', name: 'Bengali' },
  { code: 'bod', name: 'Tibetan' },
  { code: 'bos', name: 'Bosnian' },
  { code: 'bre', name: 'Breton' },
  { code: 'bul', name: 'Bulgarian' },
  { code: 'cat', name: 'Catalan; Valencian' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'ces', name: 'Czech' },
  { code: 'chi_sim', name: 'Chinese - Simplified' },
  { code: 'chi_sim_vert', name: 'Chinese - Simplified (vertical)' },
  { code: 'chi_tra', name: 'Chinese - Traditional' },
  { code: 'chi_tra_vert', name: 'Chinese - Traditional (vertical)' },
  { code: 'chr', name: 'Cherokee' },
  { code: 'cos', name: 'Corsican' },
  { code: 'cym', name: 'Welsh' },
  { code: 'dan', name: 'Danish' },
  { code: 'deu', name: 'German' },
  { code: 'div', name: 'Divehi; Dhivehi; Maldivian' },
  { code: 'dzo', name: 'Dzongkha' },
  { code: 'ell', name: 'Greek, Modern (1453-)' },
  { code: 'eng', name: 'English' },
  { code: 'enm', name: 'English, Middle (1100-1500)' },
  { code: 'epo', name: 'Esperanto' },
  { code: 'equ', name: 'Math / equation detection' },
  { code: 'est', name: 'Estonian' },
  { code: 'eus', name: 'Basque' },
  { code: 'fao', name: 'Faroese' },
  { code: 'fas', name: 'Persian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fin', name: 'Finnish' },
  { code: 'fra', name: 'French' },
  { code: 'frk', name: 'Frankish' },
  { code: 'frm', name: 'French, Middle (ca. 1400-1600)' },
  { code: 'fry', name: 'Western Frisian' },
  { code: 'gla', name: 'Scottish Gaelic' },
  { code: 'gle', name: 'Irish' },
  { code: 'glg', name: 'Galician' },
  { code: 'grc', name: 'Greek, Ancient (-1453)' },
  { code: 'guj', name: 'Gujarati' },
  { code: 'hat', name: 'Haitian; Haitian Creole' },
  { code: 'heb', name: 'Hebrew' },
  { code: 'hin', name: 'Hindi' },
  { code: 'hrv', name: 'Croatian' },
  { code: 'hun', name: 'Hungarian' },
  { code: 'hye', name: 'Armenian' },
  { code: 'iku', name: 'Inuktitut' },
  { code: 'ind', name: 'Indonesian' },
  { code: 'isl', name: 'Icelandic' },
  { code: 'ita', name: 'Italian' },
  { code: 'ita_old', name: 'Italian - Old' },
  { code: 'jav', name: 'Javanese' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'jpn_vert', name: 'Japanese (vertical)' },
  { code: 'kan', name: 'Kannada' },
  { code: 'kat', name: 'Georgian' },
  { code: 'kat_old', name: 'Georgian - Old' },
  { code: 'kaz', name: 'Kazakh' },
  { code: 'khm', name: 'Central Khmer' },
  { code: 'kir', name: 'Kirghiz; Kyrgyz' },
  { code: 'kmr', name: 'Kurmanji (Kurdish - Latin Script)' },
  { code: 'kor', name: 'Korean' },
  { code: 'kor_vert', name: 'Korean (vertical)' },
  { code: 'lao', name: 'Lao' },
  { code: 'lat', name: 'Latin' },
  { code: 'lav', name: 'Latvian' },
  { code: 'lit', name: 'Lithuanian' },
  { code: 'ltz', name: 'Luxembourgish' },
  { code: 'mal', name: 'Malayalam' },
  { code: 'mar', name: 'Marathi' },
  { code: 'mkd', name: 'Macedonian' },
  { code: 'mlt', name: 'Maltese' },
  { code: 'mon', name: 'Mongolian' },
  { code: 'mri', name: 'Maori' },
  { code: 'msa', name: 'Malay' },
  { code: 'mya', name: 'Burmese' },
  { code: 'nep', name: 'Nepali' },
  { code: 'nld', name: 'Dutch; Flemish' },
  { code: 'nor', name: 'Norwegian' },
  { code: 'oci', name: 'Occitan (post 1500)' },
  { code: 'ori', name: 'Oriya' },
  { code: 'osd', name: 'Orientation and script detection' },
  { code: 'pan', name: 'Panjabi; Punjabi' },
  { code: 'pol', name: 'Polish' },
  { code: 'por', name: 'Portuguese' },
  { code: 'pus', name: 'Pushto; Pashto' },
  { code: 'que', name: 'Quechua' },
  { code: 'ron', name: 'Romanian; Moldavian; Moldovan' },
  { code: 'rus', name: 'Russian' },
  { code: 'san', name: 'Sanskrit' },
  { code: 'sin', name: 'Sinhala; Sinhalese' },
  { code: 'slk', name: 'Slovak' },
  { code: 'slv', name: 'Slovenian' },
  { code: 'snd', name: 'Sindhi' },
  { code: 'spa', name: 'Spanish; Castilian' },
  { code: 'spa_old', name: 'Spanish; Castilian - Old' },
  { code: 'sqi', name: 'Albanian' },
  { code: 'srp', name: 'Serbian' },
  { code: 'srp_latn', name: 'Serbian - Latin' },
  { code: 'sun', name: 'Sundanese' },
  { code: 'swa', name: 'Swahili' },
  { code: 'swe', name: 'Swedish' },
  { code: 'syr', name: 'Syriac' },
  { code: 'tam', name: 'Tamil' },
  { code: 'tat', name: 'Tatar' },
  { code: 'tel', name: 'Telugu' },
  { code: 'tgk', name: 'Tajik' },
  { code: 'tha', name: 'Thai' },
  { code: 'tir', name: 'Tigrinya' },
  { code: 'ton', name: 'Tonga (Tonga Islands)' },
  { code: 'tur', name: 'Turkish' },
  { code: 'uig', name: 'Uighur; Uyghur' },
  { code: 'ukr', name: 'Ukrainian' },
  { code: 'urd', name: 'Urdu' },
  { code: 'uzb', name: 'Uzbek' },
  { code: 'uzb_cyrl', name: 'Uzbek - Cyrillic' },
  { code: 'vie', name: 'Vietnamese' },
  { code: 'yid', name: 'Yiddish' },
  { code: 'yor', name: 'Yoruba' }
].sort((a, b) => a.name.localeCompare(b.name));

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [tool, setTool] = useState<'brush' | 'auto' | 'line' | 'area'>('brush');
  const [ocrLanguage, setOcrLanguage] = useState('eng');
  const [exportTrigger, setExportTrigger] = useState({ trigger: 0, format: 'pdf' });
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png' | 'jpeg'>('pdf');
  
  const viewerRef = useRef<DocumentViewerRef>(null);

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
          <InstallApp />
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
                  className={`tool-btn ${tool === 'line' ? 'active' : ''}`} 
                  onClick={() => setTool('line')}
                  title="Line Redaction"
                >
                  <Minus size={20} />
                </button>
                <button 
                  className={`tool-btn ${tool === 'area' ? 'active' : ''}`} 
                  onClick={() => setTool('area')}
                  title="Area Redaction"
                >
                  <Square size={20} />
                </button>
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }}></div>
                <select
                  value={ocrLanguage}
                  onChange={(e) => setOcrLanguage(e.target.value)}
                  className="lang-select"
                  title="OCR Language (used for scanned documents)"
                >
                  {OCR_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
                <button 
                  className="tool-btn" 
                  onClick={handleAutoRedact}
                  disabled={isProcessing}
                  title="Auto-Redact Sensitive Info"
                >
                  <Wand2 size={20} />
                </button>
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }}></div>
                <input 
                  type="range" 
                  min="5" max="50" 
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="range-slider" 
                  title="Brush Size" 
                />
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 8px' }}></div>
                <button 
                  className="tool-btn" 
                  onClick={() => viewerRef.current?.undo()}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo size={20} />
                </button>
                <button 
                  className="tool-btn" 
                  onClick={() => viewerRef.current?.redo()}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo size={20} />
                </button>
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
                ref={viewerRef}
                file={file} 
                brushSize={brushSize}
                tool={tool}
                onProcessing={setIsProcessing}
                exportTrigger={exportTrigger}
                ocrLanguage={ocrLanguage}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

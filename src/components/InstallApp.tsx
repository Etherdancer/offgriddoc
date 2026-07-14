import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

export const InstallApp: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }

    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone) {
    return null;
  }

  // Only show the install button if we have a prompt (Android/Desktop) OR if it's iOS (where prompt is never fired)
  if (!deferredPrompt && !isIOS) {
    return null;
  }

  const handleInstallClick = () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
      });
    }
  };

  return (
    <>
      <button 
        onClick={handleInstallClick} 
        className="btn" 
        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', gap: '0.25rem', backgroundColor: 'rgba(79, 70, 229, 0.2)', color: 'var(--text-primary)', border: '1px solid rgba(79, 70, 229, 0.5)' }}
      >
        <Download size={14} /> Install App
      </button>

      {showIOSModal && (
        <div className="modal-overlay" onClick={() => setShowIOSModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header">
              <h2>Install on iOS</h2>
              <button className="icon-btn" onClick={() => setShowIOSModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <div style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '50%', marginBottom: '0.5rem' }}>
                <Share size={32} color="var(--primary-color)" />
              </div>
              <p style={{ margin: 0, fontSize: '1.1rem' }}>
                To install OffGridDoc on your iPhone or iPad:
              </p>
              <ol style={{ textAlign: 'left', margin: '0 auto', display: 'inline-block', lineHeight: '1.6' }}>
                <li>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              </ol>
              <button className="btn btn-primary" onClick={() => setShowIOSModal(false)} style={{ width: '100%', marginTop: '1rem' }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

registerSW({
  immediate: true,
  onNeedRefresh() {
    if (confirm("New content is available. Reload to update? Warning: This will discard unsaved redactions.")) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { createWorker, OEM, type Worker } from 'tesseract.js';

/** Languages whose model ships with the app (see `vite.config.ts`). */
const BUNDLED_LANGS = new Set(['eng']);
const CDN_LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';
const LOAD_TIMEOUT_MS = 90_000;

/**
 * Creates a Tesseract worker for [lang] (e.g. "eng" or "hrv+eng").
 *
 * The OCR engine (worker + WebAssembly core) and the English model are served from this
 * app's own origin, so English OCR works fully offline. Other languages' models are large
 * (1–15 MB each, 100+ languages), so they are downloaded from jsDelivr the first time they
 * are used and then cached in IndexedDB by Tesseract. Only the model is downloaded — the
 * document itself never leaves the device.
 *
 * Rejects with a readable error instead of hanging when a model can't be downloaded.
 */
export async function createOcrWorker(lang: string): Promise<Worker> {
  const base = import.meta.env.BASE_URL;
  const allBundled = lang.split('+').every(l => BUNDLED_LANGS.has(l));
  let failure: unknown = null;

  const workerPromise = createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/`,
    workerBlobURL: false,
    // Local models live at /tesseract/lang/<lang>.traineddata.gz; CDN models at <lang>/4.0.0_best_int/.
    langPath: allBundled ? `${base}tesseract/lang` : undefined,
    errorHandler: (e: unknown) => { failure = e; },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      failure ? String(failure) :
        allBundled ? 'OCR engine did not start.' :
        `Could not download the OCR model for "${lang}". Connect to the internet once to ` +
        `download it (from ${CDN_LANG_PATH}); after that it works offline.`
    )), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([workerPromise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

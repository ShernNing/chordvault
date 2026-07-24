// Photo → text via tesseract.js. The library (wasm core + language data) is
// dynamically imported so it stays out of the main bundle and only loads when a
// user actually imports a photo. Runs fully client-side — the image never leaves
// the device. Recognition needs network the first time to fetch the wasm + model.

/**
 * OCR an image File/Blob to plain text.
 *   onProgress(fraction 0..1)  optional progress callback for the recognize pass
 * Throws on failure (caller surfaces the message).
 */
export async function recognizeImage(file, onProgress) {
  const mod = await import('tesseract.js')
  const Tesseract = mod.default || mod
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof onProgress === 'function') {
        onProgress(m.progress)
      }
    },
  })
  return (data?.text || '').trim()
}

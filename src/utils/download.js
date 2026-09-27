/**
 * Minimal local file-save helper.
 *
 * Deliberately dependency-free: exports are created from a Blob in the current
 * tab and handed to the browser's own download mechanism. No network, no
 * third-party download shim.
 */

/** Save a Blob to disk under `fileName`. */
export const saveBlob = (blob, fileName) => {
  if (typeof document === 'undefined' || !document.createElement) {
    throw new Error('Saving files requires a browser environment.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { fileName, size: blob.size };
};

/** Build a text Blob for the plain-text fallback export. */
export const textBlob = (text, type = 'text/plain;charset=utf-8') => new Blob([text], { type });

export default saveBlob;

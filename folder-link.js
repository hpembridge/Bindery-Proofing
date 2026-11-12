// ── Folder link: connect this proof's art folder (Chrome / Edge only) ──
// Uses the browser's File System Access API. Nothing is remembered: each
// proof links its own folder, and the link lasts until the page is closed
// or reloaded. Only files directly in the folder are used (subfolders are
// ignored).
//
// Limits (browser rules, not ours):
//   • Chrome and Edge only. Safari and Firefox can't link a folder, so the
//     Link folder control stays hidden there.
//   • Only the folder's name is available, never its full path.
//
// In Angular: becomes a small service (pick a folder / list its images).

(function () {
  'use strict';

  const IMAGE_FILE = /\.(psd|png|jpe?g)$/i;

  window.FolderLink = {
    supported: 'showDirectoryPicker' in window,

    // Opens the folder picker (needs a click). Returns null if cancelled.
    async pick() {
      try {
        return await window.showDirectoryPicker({ id: 'bindery-proof-art', mode: 'read' });
      } catch (err) {
        if (err.name === 'AbortError') return null;
        throw err;
      }
    },

    // PSD/PNG/JPG files directly in the folder, by lower-case file name
    async listImages(dir) {
      const found = new Map();
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && !entry.name.startsWith('.') && IMAGE_FILE.test(entry.name)) {
          found.set(entry.name.toLowerCase(), entry);
        }
      }
      return found;
    },

    // File picker that opens in the linked folder (for Add images)
    async pickFiles(startIn) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          startIn,
          types: [{
            description: 'PSD, PNG or JPG',
            accept: { 'image/vnd.adobe.photoshop': ['.psd'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
          }],
        });
        return Promise.all(handles.map(h => h.getFile()));
      } catch (err) {
        if (err.name === 'AbortError') return [];
        throw err;
      }
    },
  };
})();

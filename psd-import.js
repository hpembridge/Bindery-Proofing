// ── Image import: PSD (via ag-psd), PNG, JPG ──
// Turns a dropped file into something the proof page can show:
//   { name, url, widthIn, heightIn, warnings: [] }
// or throws an Error with a message for the user.
//
// PSDs: only the flattened preview Photoshop stores in the file is read
// (layers are skipped), so even large files are quick. Checks:
//   • No flattened preview (saved without Maximize Compatibility) → refused
//   • CMYK, Lab, Duotone, Multichannel → refused (read straight from the PSD
//     header; the browser can't show these colors accurately, and ag-psd
//     can't open them anyway)
//   • 16/32-bit → shown, with a warning
// Physical size comes from the file's resolution, so images keep their
// real proportions to each other.

(function () {
  'use strict';

  const COLOR_MODES = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };
  const DEFAULT_PPI = 300;  // when a PNG/JPG (or PSD) doesn't say

  const baseName = file => file.name.replace(/\.[^.]+$/, '');

  function canvasToUrl(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Couldn’t draw the image.')), 'image/png');
    });
  }

  // PSD header: "8BPS", version, 6 reserved, channels, height, width, depth, color mode
  function readHeader(buffer) {
    const v = new DataView(buffer);
    if (buffer.byteLength < 26 || v.getUint32(0) !== 0x38425053) return null;   // "8BPS"
    return { bitsPerChannel: v.getUint16(22), colorMode: v.getUint16(24) };
  }

  const ALLOWED_MODES = ['RGB', 'Grayscale', 'Indexed', 'Bitmap'];

  async function importPsd(file) {
    const buffer = await file.arrayBuffer();
    const header = readHeader(buffer);
    if (!header) throw new Error(file.name + ' isn’t a valid PSD file.');
    const headerMode = COLOR_MODES[header.colorMode] || 'Unknown';
    if (ALLOWED_MODES.indexOf(headerMode) === -1) {
      throw new Error(file.name + ' is a ' + headerMode + ' file. Browsers can’t show ' + headerMode +
        ' colors accurately, so it wasn’t added. Save an RGB copy (Image › Mode › RGB Color) or export a PNG.');
    }

    let psd;
    try {
      psd = window.agPsd.readPsd(buffer, { skipLayerImageData: true, skipThumbnail: true });
    } catch (err) {
      throw new Error(file.name + ' couldn’t be read as a PSD. (' + err.message + ')');
    }

    const res = psd.imageResources || {};

    // Saved without Maximize Compatibility: the stored preview is blank
    if (res.versionInfo && res.versionInfo.hasRealMergedData === false) {
      throw new Error(file.name + ' was saved without Maximize Compatibility, so it has no flattened preview. ' +
        'Re-save it in Photoshop with that option on, or export a PNG.');
    }
    if (!psd.canvas) {
      throw new Error(file.name + ' has no flattened preview to show.');
    }

    const warnings = [];
    const mode = headerMode;
    if (header.bitsPerChannel > 8) warnings.push(header.bitsPerChannel + '-bit file: shown at 8-bit.');

    // Physical size from the PSD's resolution (PPCM → PPI)
    const ri = res.resolutionInfo;
    let ppi = ri ? ri.horizontalResolution : 0;
    if (ri && ri.horizontalResolutionUnit === 'PPCM') ppi *= 2.54;
    if (!ppi) {
      ppi = DEFAULT_PPI;
      warnings.push('No resolution saved in the file; assumed ' + DEFAULT_PPI + ' ppi, so the size may be wrong.');
    }

    return {
      name: baseName(file),
      url: await canvasToUrl(psd.canvas),
      widthIn: psd.width / ppi,
      heightIn: psd.height / ppi,
      ppi: Math.round(ppi),
      colorMode: mode,
      warnings,
    };
  }

  // PNG / JPG: browsers don't expose the file's resolution, so 300 ppi is assumed
  // unless the name says otherwise (e.g. "cover@150.png").
  function importBitmap(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const m = file.name.match(/@(\d{2,4})(?:ppi|dpi)?\./i);
        const ppi = m ? Number(m[1]) : DEFAULT_PPI;
        resolve({
          name: baseName(file).replace(/@\d+(ppi|dpi)?$/i, ''),
          url,
          widthIn: img.naturalWidth / ppi,
          heightIn: img.naturalHeight / ppi,
          ppi,
          colorMode: 'RGB',
          warnings: m ? [] : ['PNG/JPG size assumed at ' + DEFAULT_PPI + ' ppi. If it’s different, add the resolution to the file name (cover@150.png).'],
        });
      };
      img.onerror = () => reject(new Error(file.name + ' couldn’t be opened as an image.'));
      img.src = url;
    });
  }

  window.ImageImport = {
    accepts: file => /\.(psd|png|jpe?g)$/i.test(file.name),
    read(file) {
      if (/\.psd$/i.test(file.name)) return importPsd(file);
      if (/\.(png|jpe?g)$/i.test(file.name)) return importBitmap(file);
      return Promise.reject(new Error(file.name + ' isn’t a PSD, PNG or JPG.'));
    },
  };
})();

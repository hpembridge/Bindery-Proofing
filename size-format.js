// ── Size parsing + formatting ──
// Pure functions, no DOM. In Angular this becomes a pipe + validator.
//
//   SizeFormat.parse('8.5x11 folded', { inchMarks: true })
//   → { ok: true, text: '8.5" x 11" folded (17" x 11" flat)', warning: null }
//
// Accepts:  8.5 x 11 · 8.5x11 · 8.5"x11" · 8 1/2 by 11 · 8.5 × 11
//           8.5 x 11 folded                    (flat size worked out: 17 x 11)
//           8.5 x 11 folded (17 x 11 flat)     (either order; "fold"/"flat" both work)
// Output:   W x H                              plain size
//           W x H folded (FW x FH flat)        folded size
// Warns when the folded width isn't half the flat width, or the heights differ.

(function () {
  'use strict';

  // One number: 8 · 8.5 · .5 · 1/2 · 8 1/2 · 8-1/2
  const NUM = String.raw`(?:\d+(?:\.\d+)?(?:[\s-]+\d+\/\d+)?|\d+\/\d+|\.\d+)`;
  // Optional inch mark after a number: " ” '' in in. inch inches
  const INCH = String.raw`\s*(?:"|”|''|in(?:ch(?:es)?)?\.?)?`;
  // W x H (also ×, X, *, by)
  const PAIR = new RegExp(`(${NUM})${INCH}\\s*(?:x|×|\\*|by)\\s*(${NUM})${INCH}`, 'gi');
  // Words allowed around the sizes; anything else means it isn't a size
  const ALLOWED_LEFTOVER = /^(?:\s|[(),\/:;-]|folded|fold|flat|open|finished|to)*$/i;

  function toNumber(str) {
    const s = str.trim();
    const mixed = s.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const frac = s.match(/^(\d+)\/(\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    return Number(s);
  }

  // 8.500 → "8.5", 17 → "17"
  function num(n, inchMarks) {
    const s = String(Math.round(n * 1000) / 1000);
    return inchMarks ? s + '"' : s;
  }

  function format(size, inchMarks) {
    const base = num(size.w, inchMarks) + ' x ' + num(size.h, inchMarks);
    if (!size.folded) return base;
    return base + ' folded (' + num(size.flatW, inchMarks) + ' x ' + num(size.flatH, inchMarks) + ' flat)';
  }

  const near = (a, b) => Math.abs(a - b) < 0.001;

  function warningFor(size, inchMarks) {
    if (!size.folded) return null;
    if (!near(size.w * 2, size.flatW)) {
      return 'Folded width ' + num(size.w, inchMarks) + ' isn’t half the flat width ' + num(size.flatW, inchMarks) + '.';
    }
    if (!near(size.h, size.flatH)) {
      return 'Folded height ' + num(size.h, inchMarks) + ' doesn’t match the flat height ' + num(size.flatH, inchMarks) + '.';
    }
    return null;
  }

  function parse(text, opts) {
    const inchMarks = !!(opts && opts.inchMarks);
    const input = String(text || '').trim();
    const fail = { ok: false, error: 'Enter a size like 8.5 x 11 or 8.5 x 11 folded.' };
    if (!input) return fail;

    const pairs = [...input.matchAll(PAIR)].map(m => ({
      w: toNumber(m[1]), h: toNumber(m[2]),
      start: m.index, end: m.index + m[0].length,
    }));
    if (!pairs.length || pairs.length > 2) return fail;
    if (pairs.some(p => !(p.w > 0) || !(p.h > 0))) return fail;

    // Everything that isn't a W x H pair must be fold/flat wording or punctuation
    let leftover = input;
    pairs.slice().reverse().forEach(p => { leftover = leftover.slice(0, p.start) + ' ' + leftover.slice(p.end); });
    if (!ALLOWED_LEFTOVER.test(leftover)) return fail;

    const says = word => new RegExp('\\b' + word, 'i').test(input);
    let size;

    if (pairs.length === 1) {
      const p = pairs[0];
      size = says('fold')
        ? { w: p.w, h: p.h, folded: true, flatW: p.w * 2, flatH: p.h }   // flat worked out
        : { w: p.w, h: p.h, folded: false };                              // plain (or "flat" only)
    } else {
      // Which pair is the flat one? The pair right next to the word "flat",
      // otherwise the one that isn't next to "fold", otherwise the larger one.
      const near_ = (p, word) => new RegExp('^[\\s"”)]*' + word, 'i').test(input.slice(p.end)) ||
                                 new RegExp(word + '[\\s:(]*$', 'i').test(input.slice(0, p.start));
      let flatIdx = pairs.findIndex(p => near_(p, 'flat'));
      if (flatIdx < 0) {
        const foldIdx = pairs.findIndex(p => near_(p, 'fold'));
        flatIdx = foldIdx >= 0 ? 1 - foldIdx : (pairs[0].w * pairs[0].h >= pairs[1].w * pairs[1].h ? 0 : 1);
      }
      const flat = pairs[flatIdx], fold = pairs[1 - flatIdx];
      size = { w: fold.w, h: fold.h, folded: true, flatW: flat.w, flatH: flat.h };
    }

    return { ok: true, size, text: format(size, inchMarks), warning: warningFor(size, inchMarks) };
  }

  window.SizeFormat = { parse, format };
})();

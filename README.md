# Bindery Proofing

HTML/CSS/JS tool for building 17 × 11 bindery proofs. Each **option** is one page: the artwork on top (dropped in as PSDs) and a full-width footer that describes the option (materials, inserts, decorations, features). Each page saves as its own PDF. The layout follows the creative team's examples ("Updated Digital Rendering").

## Run it

```bash
python3 -m http.server
# open http://localhost:8000
```

It has to be served over http, because the dropdown lists are fetched (a `file://` page can't do that).

### Styles

This isn't a Platinum tool, so it doesn't use the PL-shared design tokens or sidebar. Its styles live in `bindery-proofing.css` alone. The values come from Tailwind's scales and are defined as custom properties at the top of that file. Icons use the Font Awesome kit, and the font is Inter from Google Fonts.

## Using it

- **Job details (above the canvas):** Job Number, Management Group, Property Name and Job Name. They apply to every page and print in the running header. **Link folder** starts the row and **Save PDF** ends it.
- **Top bar:** Light footer / Dark footer, Designer (remembered in this browser) and Settings.
- **Pages (left):** one page per option. Click a page to show it. Use **+** to add a page, the hover buttons to duplicate or delete it, and the grip to drag pages into a new order. Options are renumbered to match.
- **Canvas (middle):** the selected page at 17 × 11, scaled to fit the window.
  - Drop PSD files onto it, or use **Add images**. PNG and JPG work too.
  - All images on a page are scaled by the same amount, so they keep their real proportions. Each one is labeled "Shown at X%".
  - The % is a tidy number at or below the largest that fits above the footer (never above 100%): 25, 50 or 75% when that's within 10 points of the fit, otherwise rounded down to a multiple of 10. For example, if 58% fits it uses 50%; if 68% fits it uses 60%.
  - Click an image's label (Cover, Interior…) to rename it. It defaults to the file name.
  - Hover an image to drag it into a new order or remove it.
- **Running header:** the job info prints in one line across the top of every page, plus "Option N" on the right when there's more than one option.
- **Footer:** fills in live. Hover it and click **Edit** to open that option's form in the drawer on the right. **Light footer / Dark footer** in the top bar switches between the two styles in the examples.
- **Save PDF** (at the end of the job details): saves every option as one multi-page PDF, one 17 × 11 page per option in Pages-panel order, with no margins. It uses the print dialog like the MCS does: choose **Save as PDF**. The file name is filled in as `<job number> Proof`.

### Image files

| File | What happens |
|---|---|
| RGB PSD (8-bit) | Added. Only the flattened preview stored in the PSD is read, so it's quick even for big files. Its size comes from the PSD's resolution. |
| 16/32-bit PSD | Added, with a note that it's shown at 8-bit. |
| PSD saved without **Maximize Compatibility** | Not added. The file has no flattened preview, and a message says to re-save it with that option on or to export a PNG. |
| CMYK, Lab, Duotone or Multichannel PSD | Not added. The color mode is read from the PSD's header, and a message says to save an RGB copy or export a PNG. Browsers can't show these colors accurately. |
| PNG / JPG | Added. Browsers can't read their resolution, so 300 ppi is assumed. If it's different, put the resolution in the file name, e.g. `cover@150.png`. |

Images are kept only until the page is reloaded. A [linked folder](#linking-the-proofs-folder) can bring them back.

PSDs are read with **ag-psd** (MIT license, `vendor/ag-psd-31.0.3.js`). It's kept in the repo so the tool works offline and doesn't change unexpectedly.

### Logo

`assets/logo-on-dark.png` and `assets/logo-on-light.png` were cropped from the example PDF as stand-ins. Swap in the real logo files (SVG preferred) with the same names, or update the two `<img>` tags in the footer.

## Data source: the Google Sheet

All suggestion lists come from the spreadsheet, so the team can edit them without touching code.

1. Share the sheet: **Anyone with the link → Viewer**.
2. Paste its ID into `sheet-config.js` → `SHEET_ID`.

A toast at the bottom of the window shows where the lists came from. It fades out when the sheet loads; warnings stay until you close them. If the sheet is unreachable, the page falls back to the CSV snapshots in `data/`.

| Tab | Columns | Notes |
|---|---|---|
| `materials` | `Material`, one column per function, `Detail List` | Put `x` where a material can be used for a function. The Function suggestions follow the column order. `Detail List` names a tab with a second-level pick list (Bookcloth → `bookcloth`). |
| `binding_types` | `Binding Type`, `standard`, `folded`, `variable` | `x` chooses which Insert Size suggestions a binding type gets (`standard` = flat sizes, `folded` = folded sizes) and whether "Variable" is suggested for Insert Count. |
| `features` | `Feature`, `Type` | The toggles are grouped by `Type`, and each type gets its own footer column labeled with the type (Decoration, Feature…). |
| `bookcloth` | `Name`, `Customer Facing Name`, … | `Name` is what you search by; `Customer Facing Name` is what prints, exactly as written. |
| `Sizes` | `w`, `h`, `flat w`, `folded` (+ the `inch marks?` checkbox) | Insert Size suggestions. The `inch marks?` checkbox turns inch marks on or off everywhere. |

## Files

| File | What it is |
|---|---|
| `index.html` | All markup, plus the `<template>`s for pages, images, footer items, rows, chips and option cards |
| `bindery-proofing.css` | All styles, in component order |
| `proof-page.js` | Pages panel, canvas, image fitting, footer, Edit drawer, Save PDF |
| `psd-import.js` | Reads PSD/PNG/JPG files and checks them |
| `folder-link.js` | Links the proof's art folder for this session (Chrome/Edge only) |
| `bindery-proofing.js` | The option form (rows, comboboxes, chips, toggles, custom features) |
| `combobox.js` | Type-ahead fields |
| `size-format.js` | Parses, validates and formats sizes (W x H, folded/flat) |
| `sortable.js` | Drag & drop reordering (pages, images, rows, chips) |
| `saved-suggestions.js` | Remembers Management Group / Property Name in this browser + Settings |
| `sheet-config.js`, `sheet-data.js` | Google Sheet ID and loader (stands in for a real API) |
| `vendor/` | ag-psd and its license |
| `assets/` | Footer logos |
| `data/` | CSV snapshots of the sheet |
| `proof-footer.js` | **No longer used** (the old footer-only version). Safe to delete. |

## Other behavior

- **Insert sizes:** type a count, Tab, then a size and Enter. It becomes a chip like (2) 8.5 x 11, and you go back to Count. The size is checked and formatted (`W x H` or `W x H folded (FW x FH flat)`), with a warning if the folded width isn't half the flat width. Click a chip's count or size to edit it.
- **Custom features:** each feature type has a field (Custom decoration, Custom feature…). What you save becomes a toggle in that option only, switched on. Switch it off to remove it. It isn't written to the sheet, but it's saved in the PDF with the option and copied when you duplicate the option.
- **Footer lists** with more than one item get a "- " in front of each item, like the examples. Empty columns are left out. The Option line only shows when there's more than one option.
- **Saved suggestions:** Management Group and Property Name remember what you type in this browser. Use the gear button to turn this off or remove entries.
- **Drag & drop:** grips on pages, images, binding/material rows and size chips. Items stay within their own list. Grips also work with the arrow keys.

## Reloading a saved proof

Like the MCS, **Save PDF** writes the proof's data into the PDF as tiny white text on the first page, between `%%BP%%` marks. That covers the job fields, footer style, every option's form and any custom features. **Drop that PDF anywhere on the tool** to reload it. The PDF is read with pdf.js, the same version the MCS loads from cdnjs. If you already have work open, it asks before replacing it.

Images aren't stored in the PDF, because they'd make it huge. Their labels and file names are. If the job's folder is linked, the images are added back automatically (see below). Otherwise a message lists which images each option had (e.g. "Option 1: Cover, Interior") so you can drop them back in.

**Designer** is remembered in this browser and filled in automatically, like the MCS. It uses the same storage key (`mcs_designer`), so the two tools share it when they're opened from the same address.

## Linking the proof's folder

**Chrome and Edge only.** Safari and Firefox can't link a folder, so the button doesn't show there.

- **Link folder** (at the start of the job details) picks the folder with this proof's art. It isn't remembered: each proof links its own folder, and the link lasts until the page is closed or reloaded.
- Only files directly in the folder are used. Subfolders are ignored.
- With a folder linked:
  - **Reloading a PDF** adds the images back by file name, in their original order and with their labels. You can link the folder before or after dropping the PDF.
  - **↻ (Reload images)** re-reads every image on the proof from the folder, e.g. after a PSD is re-saved. Labels and order stay the same.
  - **Add images** opens the file picker in that folder.
- Browsers only give the folder's name, not its full path. The PDF stores the name, so the reload message can say which folder it was.

### Flags on the Pages panel

Each image's **last-modified date** is saved in the PDF. When the images come back from the linked folder (or ↻ re-reads them), the dates are compared:

| Flag | Means | Message above the canvas |
|---|---|---|
| Amber **\*** badge | **Art changed** since the proof was saved, so the specs may need edits. | "Artwork updated since last proof." with **Review Option N specifications** (one per option): opens that option in the Edit drawer. |
| Red **?** badge | **None of the option's files** are in the folder, so it may have been omitted. (If only some are missing, nothing is flagged.) | "Files for option N weren't found in the artwork folder." with **Remove missing option(s)**: deletes those options. |

The badges sit in the top-left corner of the page's thumbnail. Hover one to see which files.

Clicking a message's button, or its ✕, closes the message and clears that badge. **Save PDF** also clears all badges, since the new PDF is the new starting point. Dropping a missing file in by hand keeps its original label.

PDFs saved before dates were added can't be compared, so they never show the Art changed flag.

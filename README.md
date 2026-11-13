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
- **Canvas (middle):** the selected page, scaled to fit the window.
  - **17 × 11 / 11 × 17** (canvas toolbar) sets that option's page to landscape or portrait. Each option has its own, so one PDF can mix both (11 × 17 suits tall, skinny menus with a short footer). The Pages panel shows portrait pages as tall thumbnails.
  - Drop PSD files onto it, or use **Add images**. PNG and JPG work too.
  - All images on a page are scaled by the same amount, so they keep their real proportions. Each one is labeled "Shown at X%".
  - The % is a tidy number at or below the largest that fits above the footer (never above 100%): 25, 50 or 75% when that's within 10 points of the fit, otherwise rounded down to a multiple of 10. For example, if 58% fits it uses 50%; if 68% fits it uses 60%.
  - Click an image's label (Cover, Interior…) to rename it: type, or pick from the suggestions (the `functions_labels` headers). It defaults to the file name. Renaming it renames its count column in the editor, and the counts move with it.
  - Hover an image to drag it into a new order or remove it.
- **Running header:** the job info prints in one line across the top of every page, plus "Option N" on the right when there's more than one option.
- **Footer:** fills in live, one labeled box per image (EXTERIOR, INTERIOR…) with Material, Inserts, Decoration and Other columns. Empty columns and boxes are left out. **Light footer / Dark footer** in the top bar switches between the two styles.
- **Edit option** (or hover the footer and click **Edit**) opens that option's specs in a drawer on the right, so the page stays in view while you edit. See [The option editor](#the-option-editor).
- **Save PDF** (at the end of the job details): saves every option as one multi-page PDF, one page per option (17 × 11 or 11 × 17) in Pages-panel order, with no margins. It uses the print dialog like the MCS does: choose **Save as PDF**. The file name is filled in as `<job number> Proof`.

### Image files

| File | What happens |
|---|---|
| RGB PSD (8-bit) | Added. Only the flattened preview stored in the PSD is read, so it's quick even for big files. Its size comes from the PSD's resolution. |
| 16/32-bit PSD | Added, with a note that it's shown at 8-bit. |
| PSD saved without **Maximize Compatibility** | Not added. The file has no flattened preview, and a message says to re-save it with that option on or to export a PNG. |
| CMYK, Lab, Duotone or Multichannel PSD | Not added. The color mode is read from the PSD's header, and a message says to save an RGB copy or export a PNG. Browsers can't show these colors accurately. |
| PNG / JPG | Added. Browsers can't read their resolution, so 300 ppi is assumed (no message). If it's different, put the resolution in the file name, e.g. `cover@150.png`. |

Images are kept only until the page is reloaded. A [linked folder](#linking-the-proofs-folder) can bring them back.

PSDs are read with **ag-psd** (MIT license, `vendor/ag-psd-31.0.3.js`). It's kept in the repo so the tool works offline and doesn't change unexpectedly.

### Logo

`assets/logo-on-dark.png` and `assets/logo-on-light.png` were cropped from the example PDF as stand-ins. Swap in the real logo files (SVG preferred) with the same names, or update the two `<img>` tags in the footer.

## The option editor

A drawer with four tables for the selected option (up to 1100px wide, never more than 55% of the window). Each table always has one empty row at the bottom: start typing in it and a new empty row appears below. Clear every field in a row and it disappears when you leave it. There are no Add or Remove buttons. Drag a row's grip to reorder.

| Table | Columns | Prints as |
|---|---|---|
| **Material** | Type, Name, Location, Function | "Full Wrap: Majilite (#50)" in that Location's box. Name searches the type's list (Bookcloth, Rockboard) and prints its Customer Facing Name; a name that isn't on the list gets a warning and prints as typed. For types without a list, Name is free text. Location is one of the page's image labels (filled in when there's only one image); it narrows the Function suggestions to the ones that go there (`functions_labels`). |
| **Inserts** | Binding Type, Size, one count per image | "Menu Cord holds:" with a line per size under it, always with its count: "(1) 8.5 x 11 insert", "(2) 8.5 x 11 inserts", "Multiple 8.5 x 11 inserts". Counts suggest **Multiple** when the binding type has an `x` in the sheet's `variable` column. In each image box with a count. Binding Type narrows the Size suggestions; sizes are checked and formatted when you leave the field. |
| **Decoration** | Name, one count per image | "Deboss", or "Deboss x2" when the count is more than 1, in each image box with a count. |
| **Other** | Name, one count per image | Same as Decoration. |

**Count columns** are the page's image labels, in page order. Rename an image's label on the canvas and its column follows.

- **Inserts** only shows the locations that usually hold inserts: those with an `x` under `holds_inserts` on the `location_labels` tab (so Exterior and Cover are left out). A label that isn't on that tab is shown. Use **+ Add location** next to the Inserts heading to add another one for this option. A location that already has insert counts always shows.

- **One count column:** in Decoration and Other, typing a name fills in a count of 1 (clear it if you don't want it). Inserts counts are never filled in: you type them.
- **No images yet:** there's a single **Qty** column. Those counts move to the first image column once there is one (in Inserts, the first location that holds inserts).
- **A count that isn't a number** prints as typed: "Multiple 8.5 x 11 inserts", or in parentheses for Decoration/Other: "Screwposts (Multiple)".
- **Amber column header:** a label that has counts but no image on the page (e.g. after a reload, before the images are back). It goes away when an image with that label is added, or the counts are cleared.

The suggestions in Name/Decoration/Other are just suggestions: any name works.

## Data source: the Google Sheet

All suggestion lists come from the spreadsheet, so the team can edit them without touching code.

1. Share the sheet: **Anyone with the link → Viewer**.
2. Paste its ID into `sheet-config.js` → `SHEET_ID`.

A toast at the bottom of the window shows where the lists came from. It fades out when the sheet loads; warnings stay until you close them. If the sheet is unreachable, the page falls back to the CSV snapshots in `data/`.

| Tab | Columns | Notes |
|---|---|---|
| `materials` | `Material`, `Detail List`, one column per function | Put `x` where a material can be used for a function. Columns are read by name, so their order doesn't matter (Function suggestions follow it). `Detail List` names a tab to search for the Name (Bookcloth → `Bookcloth`, Rockboard → `Rockboard`). |
| `functions_labels` | `functions`, one column per image label | Put `x` where a function goes on an image (Full Wrap → Exterior, Cover). A material's Location narrows its Function suggestions to these. |
| `location_labels` | `Label`, `holds_inserts` | The image-label suggestions. `x` under `holds_inserts` = shown as a count column in Inserts by default. (Without this tab, the `functions_labels` headers are the suggestions and all of them show in Inserts.) |
| `binding_types` | `Binding Type`, `standard`, `folded`, `variable` | `x` chooses which Size suggestions an insert row gets once its Binding Type is picked (`standard` = flat sizes, `folded` = folded sizes). `variable` = suggest "Multiple" for its insert counts. |
| `features` | `Feature`, `Type` | `Type` is `Decoration` or `Other`: the suggestions for those two tables. |
| `Bookcloth`, `Rockboard` (any Detail List tab) | `Name`, `Customer Facing Name`, … | `Name` is what you search by; `Customer Facing Name` is what prints, exactly as written (the Name if it's blank). |
| `sizes` | `w`, `h`, `flat w`, `folded` (+ the `inch marks?` checkbox) | Size suggestions. The `inch marks?` checkbox turns inch marks on or off everywhere. |

## Files

| File | What it is |
|---|---|
| `index.html` | All markup, plus the `<template>`s for pages, images, footer boxes, table rows, count columns and option cards |
| `bindery-proofing.css` | All styles, in component order |
| `proof-page.js` | Pages panel, canvas, image fitting and labels, footer, Edit drawer, Save PDF |
| `psd-import.js` | Reads PSD/PNG/JPG files and checks them |
| `folder-link.js` | Links the proof's art folder for this session (Chrome/Edge only) |
| `bindery-proofing.js` | The option editor: the four tables, their empty last row, count columns, footer content |
| `combobox.js` | Type-ahead fields |
| `size-format.js` | Parses, validates and formats sizes (W x H, folded/flat) |
| `sortable.js` | Drag & drop reordering (pages, images, table rows) |
| `saved-suggestions.js` | Remembers Management Group / Property Name in this browser + Settings |
| `sheet-config.js`, `sheet-data.js` | Google Sheet ID and loader (stands in for a real API) |
| `vendor/` | ag-psd and its license |
| `assets/` | Footer logos |
| `data/` | CSV snapshots of the sheet |
| `proof-footer.js` | **No longer used** (the old footer-only version). Safe to delete. |

## Other behavior

- **Footer lists** with more than one line get a "- " in front of each item. The Option chip in the header only shows when there's more than one option.
- **Saved suggestions:** Management Group and Property Name remember what you type in this browser. Use the gear button to turn this off or remove entries.
- **Drag & drop:** grips on pages, images and table rows. Items stay within their own list. Grips also work with the arrow keys.

## Reloading a saved proof

Like the MCS, **Save PDF** writes the proof's data into the PDF as tiny white text on the first page, between `%%BP%%` marks. That covers the job fields, footer style and every option's tables. **Drop that PDF anywhere on the tool** to reload it. The PDF is read with pdf.js, the same version the MCS loads from cdnjs. If you already have work open, it asks before replacing it.

PDFs saved before the table editor reload their job details and images, but not their specs (the old form doesn't map onto the tables); a message says so.

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

# Bindery Proofing

HTML/CSS/JS prototype of the bindery proofing form (Figma: `HREYjXfLCsU3h29NsntaHI`, node `54:3240`). A job has one or more **Options**; each option lists binding types, materials (with function) and features.

## Run it

```bash
python3 -m http.server
# open http://localhost:8000
```

It has to be served over http, because the dropdown lists are fetched (a `file://` page can't do that).

### Styles

This isn't a Platinum tool, so it doesn't use the PL-shared design tokens or sidebar. Its styles live in `bindery-proofing.css` alone. The values come from Tailwind's scales and are defined as custom properties at the top of that file. Icons use the Font Awesome kit, and the font is Inter from Google Fonts.

## Data source: the Google Sheet

All dropdown lists come from the spreadsheet, so the team can edit them without touching code.

1. Import `data/bindery-proofing-data.xlsx` into the Google Sheet (File → Import → Replace spreadsheet), or rename your tabs and columns to match the list below.
2. Share it: **Anyone with the link → Viewer**.
3. Paste the sheet ID into `sheet-config.js` → `SHEET_ID`.

The status line under Job Information shows where the lists came from. If the sheet is unreachable, the page falls back to the CSV snapshots in `data/`. To refresh the snapshots, download each tab as CSV into `data/<tab>.csv`.

| Tab | Columns | Notes |
|---|---|---|
| `materials` | `Material`, one column per function, `Detail List` | Put `x` where a material can be used for a function. Function columns can be added, removed or reordered; the Function dropdown follows the column order. `Detail List` names a tab with a second-level pick list (Bookcloth → `bookcloth`). |
| `binding_types` | `Binding Type`, `standard`, `folded`, `variable` | Put `x` to choose which Insert Size suggestions a binding type gets (`standard` = flat sizes, `folded` = folded sizes) and whether "Variable" is suggested for Insert Count. With no binding type picked, everything is suggested. You can still type any size or count. |
| `features` | `Feature`, `Type` | `Type` is `Decoration` (maps to an MCS decoration) or `Feature`. The toggle buttons are grouped by type. |
| `bookcloth` | `Name`, `Customer Facing Name`, … | `Name` (first column) is what you search by; `Customer Facing Name` is what prints on the footer. |
| `Sizes` | `w`, `h`, `flat w`, `folded` (+ the `inch marks?` checkbox) | Suggestions for Insert Size. The display text is rebuilt from the number columns, so it always matches how typed sizes are formatted. The `inch marks?` checkbox turns inch marks on or off everywhere. |

## Files

| File | What it is |
|---|---|
| `index.html` | All markup, plus the `<template>`s for rows, options and combobox suggestions |
| `proof-footer.js` | Live footer previews, width, Save PDF |
| `size-format.js` | Parses, validates and formats sizes (W x H, folded/flat) |
| `saved-suggestions.js` | Remembers Management Group / Customer in this browser + the Settings dialog |
| `sortable.js` | Drag & drop reordering (rows, size chips, footers) |
| `combobox.js` | Type-ahead behavior (filtering, keyboard, must-match-a-suggestion check) |
| `bindery-proofing.css` | Page styles, in component order |
| `bindery-proofing.js` | Prototype behavior only |
| `sheet-config.js` | Google Sheet ID + tab names |
| `sheet-data.js` | Fetches and parses the sheet (stands in for a real API) |
| `data/` | CSV snapshots + the restructured `.xlsx` |

## Implementation notes

| Component | HTML | CSS |
|---|---|---|
| `Combobox` | `div.combobox[data-combobox]` (in each row template) + `#tpl-combobox-*` | `.combobox` |
| `SizeChipInput` | `.binding-row__sizes` + `#tpl-size-chip` | `.chip-input`, `.chip` |
| `FooterDock` / `ProofFooter` | `aside.footer-dock` + `#tpl-footer-preview` | `.footer-dock`, `.footer-preview`, `.proof-footer` |
| `JobInfo` | `section.job-info` | `.job-info`, `.field` |
| `OptionList` | `#option-list` | `.option-list` |
| `OptionCard` | `section.option-card` / `#tpl-option-card` | `.option-card` |
| `OptionSection` (Binding Types / Materials / Features) | `fieldset.option-section` | `.option-section`, `.add-btn` |
| `BindingRow` | `.binding-row` / `#tpl-binding` | `.spec-row`, `.binding-row` |
| `MaterialRow` | `.material-row` / `#tpl-material` | `.material-row`, `.material-row__detail` |
| `FeatureToggles` | `[data-feature-toggles]` + `#tpl-feature-group` / `#tpl-feature-toggle` | `.feature-toggles`, `.toggle-btn` |

**Simulated in JS. In Angular these become state and event handling:**

- Adding and removing rows and options → a `FormArray` per section with `@for`; the `<template>`s are the loop bodies. Every section starts with no rows.
- Type-ahead fields (`combobox.js`) → one Combobox component: an `options` input, filtering as you type, arrow keys/Enter/Escape, and a check that the value matches a suggestion.
- Insert sizes → Enter adds the size as a chip, whether or not it's on the list. `size-format.js` checks it's a W x H size, formats it as `W x H` or `W x H folded (FW x FH flat)`, adds or strips inch marks, and warns when the folded width isn't half the flat width (or the heights differ). Becomes a pipe + validator; chips are a sizes array per binding row.
- Feature toggle buttons (`aria-pressed`) → a selected-features array per option.
- "Option N" numbering → `$index + 1`. Delete is disabled when only one option is left.
- Function suggestions are filtered by the selected Material → a computed list from that material's eligibility. If the material changes, a function that's no longer eligible gets cleared.
- The Bookcloth detail field appears when the material has a `Detail List` → `@if`. The value has to match an item in the list → validator.
- `sheet-data.js` and the status line are prototype-only and get replaced by a real service.

## Proof footers

Each option gets its own footer, shown live at the bottom of the page. Set the width in inches and the boxes wrap with flexbox to fit. The first box reads `Mgmt Group / Customer` and `Job # - Job Description - Option N`. Then come Material and Inserts, plus one box per feature type from the sheet, labeled with the type (Decorations, Features…). Any list with more than one item prints as bullets, and empty boxes are left out.

**Custom features:** each feature type has its own field (Custom decoration, Custom feature…). Type and press **Save** (or Enter). It becomes a toggle of that type in every option on this slip, switched on in the option you added it from. It's kept only until the page is reloaded and isn't written to the sheet.

**Save PDF** works like the MCS: it opens the print dialog with only that footer on a page sized exactly to it (width × its current height, no margins), and the file name is filled in as `<job number> Proof Footer Option N`. Choose **Save as PDF** as the destination. The browser asks where to save each time.

## Reordering and duplicating

- **Drag & drop:** use the grip on the left of a binding type or material row, or inside a size chip, to drag it into a new place. Items stay within their own list. You can also focus a grip and use the arrow keys.
- **Option order:** drag a footer by its grip in the Proof Footers area. The options are renumbered to match, and the cards in the form move too.
- **Duplicate:** the copy button next to Delete adds a copy of that option, with everything filled in, right after it.

## Saved suggestions

Management Group and Customer remember what you type, saved in this browser's localStorage when you leave the field, and suggest it next time. Each person's browser keeps its own list. The gear button opens **Settings**, where you can turn this on or off and remove single entries or clear a whole list.

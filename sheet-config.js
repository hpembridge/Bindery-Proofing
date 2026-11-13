// ── Data source config ──
// The prototype reads its dropdown lists from a Google Sheet so the team
// can edit them without touching code.
//
// To point at the sheet:
//   1. Share the sheet as "Anyone with the link → Viewer".
//   2. Paste the ID from its URL below:
//      https://docs.google.com/spreadsheets/d/<THIS PART>/edit
//
// Leave SHEET_ID empty to use the CSV snapshots in data/ instead.

window.SHEET_CONFIG = {
  SHEET_ID: '1ndVj8cH1EqdBIzyGsGOZm-80QJOv1p8U9S7xbIVLmJs',

  // Tab names in the sheet (and matching data/<name>.csv snapshots).
  TABS: {
    materials: 'materials',
    functionsLabels: 'functions_labels',   // function → image labels (Full Wrap → Exterior, Cover)
    locationLabels: 'location_labels',     // image label suggestions + which ones hold inserts
    bindingTypes: 'binding_types',
    features: 'features',
    sizes: 'sizes',
  },
  // Detail lists (e.g. bookcloth) are loaded from whatever tab name appears
  // in the materials tab's "Detail List" column — no config needed here.
};

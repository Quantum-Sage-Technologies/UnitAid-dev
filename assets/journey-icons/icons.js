// LAUNCH journey icon set — the eight access stages, in stage order.
//
// One monoline system, not eight pieces of clip-art: every glyph is drawn on the
// same 24x24 grid with a 1.7 stroke, round caps and joins, and NO colour of its
// own — it strokes in `currentColor` so the icon takes the colour of the status
// it is reporting (and themes correctly in dark mode). Colour is never the only
// signal: the status corner badge carries a glyph too.
//
// `assets/journey-icons/*.svg` and `png/` are generated from this file —
// run `node scripts/build-journey-icons.js` after editing any path here.
(function () {
  const ICONS = [
    {
      id: "01-rnd-clinical",
      title: "R&D and Clinical",
      // Conical flask with a fill line: the trial, not a microscope.
      body: `
        <path d="M9.5 3h5"/>
        <path d="M10 3v5.2L5.6 17.4A1.6 1.6 0 0 0 7.05 19.75h9.9a1.6 1.6 0 0 0 1.45-2.35L14 8.2V3"/>
        <path d="M7.5 13.6h9"/>
        <circle cx="10.7" cy="16.5" r=".9" fill="currentColor" stroke="none"/>`
    },
    {
      id: "02-regulatory-approval",
      title: "Stringent Regulatory Approval (SRA)",
      // Dossier with a folded corner and a cleared review mark.
      body: `
        <path d="M13 2.75H7.5A1.75 1.75 0 0 0 5.75 4.5v15A1.75 1.75 0 0 0 7.5 21.25h9a1.75 1.75 0 0 0 1.75-1.75V8Z"/>
        <path d="M13 2.75V8h5.25"/>
        <path d="M9.1 14.2l2.5 2.5 4.3-5"/>`
    },
    {
      id: "03-who-guidelines",
      title: "WHO recommendation",
      // Open guideline text.
      body: `
        <path d="M12 6.5C10.3 5.1 8 4.4 5 4.4A1.1 1.1 0 0 0 3.9 5.5v11.6c0 .6.5 1.1 1.1 1.1 3 0 5.3.7 7 2.1"/>
        <path d="M12 6.5c1.7-1.4 4-2.1 7-2.1a1.1 1.1 0 0 1 1.1 1.1v11.6c0 .6-.5 1.1-1.1 1.1-3 0-5.3.7-7 2.1"/>
        <path d="M12 6.5v13.8"/>`
    },
    {
      id: "04-who-prequalification",
      title: "WHO PQ listing",
      // Quality seal on a ribbon — a mark awarded, not a security shield.
      body: `
        <circle cx="12" cy="9.6" r="5.7"/>
        <circle cx="12" cy="9.6" r="2.6"/>
        <path d="M8.5 14.5 7 21.25l5-2.5 5 2.5-1.5-6.75"/>`
    },
    {
      id: "05-country-registration",
      title: "Country registration",
      // The medicine placed on a national register: pin inside a map frame.
      body: `
        <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.2"/>
        <path d="M12 8.3a3 3 0 0 1 3 3c0 2.2-3 5.1-3 5.1s-3-2.9-3-5.1a3 3 0 0 1 3-3Z"/>
        <circle cx="12" cy="11.3" r=".95" fill="currentColor" stroke="none"/>`
    },
    {
      id: "06-national-policy",
      title: "National policy adoption",
      // Adopted into national guidance: a flag raised.
      body: `
        <path d="M6.3 3.1v18"/>
        <path d="M6.3 4.9c3.2-1.7 6.4 1.7 9.6 0v6.7c-3.2 1.7-6.4-1.7-9.6 0Z"/>`
    },
    {
      id: "07-procurement",
      title: "Procurement",
      // Treatments bought in volume: stacked cartons, not a shopping trolley.
      body: `
        <path d="M8.2 8.4V6.15A1.45 1.45 0 0 1 9.65 4.7h9.05a1.45 1.45 0 0 1 1.45 1.45v9.05a1.45 1.45 0 0 1-1.45 1.45H16.4"/>
        <rect x="3.85" y="8.4" width="12.55" height="10.9" rx="1.45"/>
        <path d="M3.85 12.05h12.55"/>
        <path d="M10.15 14.3v3.05M8.6 15.85h3.05"/>`
    },
    {
      id: "08-in-country-delivery",
      title: "In-country delivery",
      // The last mile: stock moving to the facility.
      body: `
        <rect x="2.4" y="6.4" width="11.2" height="9.2" rx="1.2"/>
        <path d="M13.6 9.8h3.2l3.6 3.4v2.4h-6.8Z"/>
        <circle cx="7.2" cy="17.8" r="1.95"/>
        <circle cx="17" cy="17.8" r="1.95"/>
        <path d="M9.2 17.8h5.85"/>`
    }
  ];

  // Shared stroke system — the reason the eight read as one set.
  const ATTR = 'fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"';

  const clean = s => s.replace(/\s+/g, " ").trim();

  window.LaunchJourneyIcons = {
    list: ICONS,
    attrs: ATTR,

    // One <svg> of <symbol>s to drop once per page; icons are then referenced by <use>.
    sprite() {
      const symbols = ICONS.map(ic =>
        `<symbol id="ji-${ic.id}" viewBox="0 0 24 24"><g ${ATTR}>${clean(ic.body)}</g></symbol>`
      ).join("");
      return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ` +
        `style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`;
    },

    // A stage icon by index, as inline markup. Decorative: the accessible name
    // lives on the marker that wraps it.
    use(i, cls) {
      const ic = ICONS[i];
      if (!ic) return "";
      return `<svg class="${cls || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
        `<use href="#ji-${ic.id}"/></svg>`;
    },

    // Standalone markup, for contexts with no sprite on the page.
    inline(i, cls) {
      const ic = ICONS[i];
      if (!ic) return "";
      return `<svg class="${cls || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ` +
        `${ATTR}>${clean(ic.body)}</svg>`;
    }
  };
})();

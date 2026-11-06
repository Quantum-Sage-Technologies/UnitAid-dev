// LAUNCH journey icons — this page's local set, for the illustrated journey
// dashboard.
//
// Originally an all-filled companion to assets/journey-icons/icons.js. After
// review, six of the seven non-WHO gates moved to that file's monoline
// system (24x24 grid, 1.7 stroke, round caps/joins, currentColor) so this
// page's icon row reads as one set instead of a filled system bolted next
// to an outline one. Each redrawn gate picked its own subject rather than
// reusing icons.js's — R&D is a test tube (not the flask/trial there),
// regulatory approval is the authority building (not the dossier), country
// registration is a stamp and pad (not the map pin), procurement stays a
// cart. The WHO PQ listing's medal-and-ribbon and in-country delivery's
// lorry matched the icons.js glyphs closely enough to reuse outright.
//
// National policy adoption is the one exception: kept pixel-identical to
// the original filled glyph by request, so it carries its own `attr`
// override back to a solid fill. Stage 3 (WHO recommendation) still carries no
// body — the WHO emblem substitutes for it, see the page's stageIconImg.
(function () {
  const ICONS = [
    {
      id: "01-rnd-clinical",
      title: "R&D and Clinical",
      // Test tube with a fill line and a bubble — the trial, not a microscope.
      body: `
        <path d="M9.5 3h5"/>
        <path d="M10 3v5.2L5.6 17.4A1.6 1.6 0 0 0 7.05 19.75h9.9a1.6 1.6 0 0 0 1.45-2.35L14 8.2V3"/>
        <path d="M7.5 13.6h9"/>
        <circle cx="10.7" cy="16.5" r=".9" fill="currentColor" stroke="none"/>`
    },
    {
      id: "02-regulatory-approval",
      title: "Stringent Regulatory Approval (SRA)",
      // The authority itself: pediment, entablature, columns, plinth.
      body: `
        <path d="M12 2.6 21.3 7.8M12 2.6 2.7 7.8"/>
        <path d="M2.7 7.8h18.6v1.7H2.7z"/>
        <path d="M5 11.3v6.4M9.3 11.3v6.4M14.7 11.3v6.4M19 11.3v6.4"/>
        <path d="M3 19.6h18"/>`
    },
    { id: "03-who-guidelines",      title: "WHO recommendation",  body: "" },   // WHO emblem
    {
      id: "04-who-prequalification",
      title: "WHO PQ listing",
      // A quality seal on a ribbon — the mark awarded, which is what
      // prequalification is.
      body: `
        <circle cx="12" cy="9" r="6"/>
        <path d="M9.3 14.4 7.6 21l4.4-2.4 4.4 2.4-1.7-6.6"/>
        <path d="M9.4 9.4l1.8 1.8 3.4-3.8"/>`
    },
    {
      id: "05-country-registration",
      title: "Country registration",
      // Entered on a national register: a stamp over its pad.
      body: `
        <rect x="10.5" y="2.3" width="3" height="3.6" rx="1.3"/>
        <path d="M11.3 5.9v1.9M12.7 5.9v1.9"/>
        <path d="M8.6 7.9h6.8l1.7 3.7H6.9z"/>
        <rect x="6.5" y="12.3" width="11" height="3.3" rx="1.1"/>
        <path d="M3.6 18.1h16.8"/>`
    },
    {
      id: "06-national-policy",
      title: "National policy adoption",
      // Unchanged by request — the one glyph on this page still drawn solid.
      attr: 'fill="currentColor" stroke="none" fill-rule="evenodd"',
      body: `
        <circle cx="12" cy="7.4" r="3.3"/>
        <path d="M12 11.9c-3.6 0-6.4 2.3-6.4 5.3v1.4h12.8v-1.4c0-3-2.8-5.3-6.4-5.3z"/>
        <circle cx="4.5" cy="10.4" r="2.5"/>
        <path d="M4.5 14c-2.4 0-4.2 1.6-4.2 3.6v1h3.5c.1-2.1 1.2-3.9 2.9-4.4-.7-.1-1.4-.2-2.2-.2z"/>
        <circle cx="19.5" cy="10.4" r="2.5"/>
        <path d="M19.5 14c2.4 0 4.2 1.6 4.2 3.6v1h-3.5c-.1-2.1-1.2-3.9-2.9-4.4.7-.1 1.4-.2 2.2-.2z"/>`
    },
    {
      id: "07-procurement",
      title: "Procurement",
      // Bought in volume: a laden cart.
      body: `
        <path d="M2.4 3h2.3a1 1 0 0 1 1 .78l.5 2.1h13a1 1 0 0 1 .97 1.24l-1.7 6.7a1.8 1.8 0 0 1-1.75 1.36H8.6a1.8 1.8 0 0 1-1.75-1.4L4 4.4H2.4"/>
        <circle cx="9.3" cy="19.6" r="1.7"/>
        <circle cx="17" cy="19.6" r="1.7"/>`
    },
    {
      id: "08-in-country-delivery",
      title: "In-country delivery",
      // The last mile: stock on the road to the facility.
      body: `
        <rect x="2.4" y="6.4" width="11.2" height="9.2" rx="1.2"/>
        <path d="M13.6 9.8h3.2l3.6 3.4v2.4h-6.8Z"/>
        <circle cx="7.2" cy="17.8" r="1.95"/>
        <circle cx="17" cy="17.8" r="1.95"/>
        <path d="M9.2 17.8h5.85"/>`
    }
  ];

  // Shared default is the same monoline stroke system as icons.js, so the
  // six redrawn gates read as one set with that page's icon language.
  // National policy opts back into the old filled attrs via its own `attr`.
  const ATTR = 'fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"';

  const clean = s => s.replace(/\s+/g, " ").trim();

  window.LaunchJourneyIconsSolid = {
    list: ICONS,
    attrs: ATTR,
    sprite() {
      const symbols = ICONS.filter(ic => ic.body).map(ic =>
        `<symbol id="jis-${ic.id}" viewBox="0 0 24 24"><g ${ic.attr || ATTR}>${clean(ic.body)}</g></symbol>`
      ).join("");
      return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ` +
        `style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`;
    },
    use(i, cls) {
      const ic = ICONS[i];
      if (!ic || !ic.body) return "";
      return `<svg class="${cls || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
        `<use href="#jis-${ic.id}"/></svg>`;
    }
  };
})();

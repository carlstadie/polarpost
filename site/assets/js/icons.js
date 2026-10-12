/* A handful of line icons in the spirit of SF Symbols, drawn on a 24-unit grid
   with a round 2-unit stroke so they sit with the system font. Each is an SVG
   string; they take their colour from the text around them. */

const svg = (d, extra = "") =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icon = {
  chevronRight: svg('<path d="M9 5l7 7-7 7"/>'),
  chevronLeft:  svg('<path d="M15 5l-7 7 7 7"/>'),
  chevronDown:  svg('<path d="M6 9l6 6 6-6"/>'),
  xmark:        svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  search:       svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  play:         svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  pause:        svg('<path d="M8 5v14M16 5v14"/>'),
  open:         svg('<path d="M4 9V4h5M20 15v5h-5M4 4l6.5 6.5M20 20l-6.5-6.5"/>'),
  route:        svg('<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17c6-1 2-9 8-10"/>'),
  flag:         svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  envelope:     svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  stamp:        svg('<path d="M6 3h12v18H6z"/><path d="M6 3c1 1 2 1 3 0s2-1 3 0 2 1 3 0 2-1 3 0" /><rect x="9" y="8" width="6" height="7" rx="1"/>'),
  person:       svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>'),
  share:        svg('<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M8 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-2"/>'),
  cachet:       svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5" stroke-dasharray="2 2"/>'),
  send:         svg('<path d="M20.5 3.5L3.5 10.5l7 3 3 7z"/><path d="M10.5 13.5L20.5 3.5"/>'),
  pen:          svg('<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>'),
  lines:        svg('<path d="M5 7h14M5 11h14M5 15h10M5 19h6"/>'),
  plane:        svg('<path d="M10.5 20.5l1.5-1.2V14l7 2.5v-2L12 10V5a1.5 1.5 0 0 0-3 0v5l-7 4.5v2L9 14v5.3l1.5 1.2z" transform="translate(1 -0.5)"/>'),
  globe:        svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>'),
};

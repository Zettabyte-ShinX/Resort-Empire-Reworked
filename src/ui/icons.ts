/**
 * Inline SVG icons.
 *
 * A small hand-picked set, drawn on a 24x24 grid with a 1.7px stroke so they
 * stay crisp and consistent with the rest of the interface.
 */

const wrap = (body: string, extra = ""): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const icons = {
  inspect: wrap(
    '<path d="M4 3.5 8.2 20l2.6-6.3 6.4-2.7z"/><path d="M14 14 20 20"/>',
  ),
  build: wrap(
    '<path d="M14.5 5.5a4 4 0 0 0 5 5L21 9l-6-6z"/><path d="M13.2 7 4 16.2V20h3.8L17 10.8z"/>',
  ),
  room: wrap(
    '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 14h18"/><path d="M7 9V6h4v3"/>',
  ),
  scenery: wrap(
    '<path d="M12 21v-4"/><path d="M12 17 8 10h8z"/><path d="M12 13 7 7h10z"/><path d="M12 9 9 4h6z"/>',
  ),
  path: wrap(
    '<path d="M4 21 9 3"/><path d="M20 21 15 3"/><path d="M9.5 12h5"/><path d="M8 17h8"/>',
  ),
  demolish: wrap(
    '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/><path d="M10 11v6M14 11v6"/>',
  ),
  janitor: wrap(
    '<path d="M14 3 7 14"/><path d="M16 6 9 17"/><path d="M4 20c3 0 5-1.5 5-4l8-8 3 3-8 8c-2.5 0-4 2-8 1z"/>',
  ),
  upgrade: wrap(
    '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',
  ),
  money: wrap(
    '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M14.5 9.5c-.6-.6-1.5-1-2.5-1-1.4 0-2.5.8-2.5 2s1.1 1.8 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-1.9-.4-2.5-1"/>',
  ),
  clock: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  users: wrap(
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.5A6 6 0 0 1 21 20"/>',
  ),
  star: wrap(
    '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
  ),
  flask: wrap(
    '<path d="M9 3h6"/><path d="M10 3v6L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>',
  ),
  pause: wrap('<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>'),
  play: wrap('<path d="M8 5.5 19 12 8 18.5z"/>'),
  fast: wrap('<path d="M3 6.5 11 12l-8 5.5z"/><path d="M12 6.5 20 12l-8 5.5z"/>'),
  sound: wrap('<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>'),
  mute: wrap('<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="m16 10 4 4m0-4-4 4"/>'),
  menu: wrap('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: wrap('<path d="m6 6 12 12M18 6 6 18"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  minus: wrap('<path d="M5 12h14"/>'),
  search: wrap('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  save: wrap('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="7"/>'),
  folder: wrap('<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
  gear: wrap(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  ),
  trophy: wrap(
    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a4 4 0 0 0 4 4"/><path d="M17 6h3v1a4 4 0 0 1-4 4"/><path d="M12 14v3"/><path d="M8.5 20h7"/><path d="M10 17h4l.5 3h-5z"/>',
  ),
  chart: wrap('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  help: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.7v.4"/><path d="M12 17.5h.01"/>'),
  chevron: wrap('<path d="m9 5 7 7-7 7"/>'),
  drag: wrap('<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  bed: wrap('<path d="M3 18v-8h13a4 4 0 0 1 4 4v4"/><path d="M3 14h17"/><path d="M7 10V7h4v3"/>'),
  pool: wrap('<path d="M3 17c2 0 2 1.5 4 1.5S9 17 11 17s2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M3 12c2 0 2 1.5 4 1.5S9 12 11 12s2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M8 9V5a2 2 0 0 1 4 0v4"/>'),
  guest: wrap('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
};

export type IconName = keyof typeof icons;

/**
 * The side panels (Notes, Research) share one place: docked on the right on
 * wide screens, a sheet from the bottom on narrow ones. Only one is open at
 * a time; opening one closes the other. While one is open the page has
 * html.has-side-panel, which moves the chapter over (css/study.css).
 */
const panels = new Set();

/** @param {{ isOpen: () => boolean, close: () => void }} panel */
export function registerSidePanel(panel) {
  panels.add(panel);
  return {
    /** Call when this panel opens. */
    opened() {
      for (const other of panels) if (other !== panel && other.isOpen()) other.close({ handOff: true });
      document.documentElement.classList.add('has-side-panel');
    },
    /** Call when this panel closes. */
    closed() {
      if (![...panels].some((other) => other.isOpen())) document.documentElement.classList.remove('has-side-panel');
    },
  };
}

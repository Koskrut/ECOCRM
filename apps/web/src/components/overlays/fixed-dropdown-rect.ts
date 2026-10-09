export type FixedDropdownRect = {
  top: number;
  left: number;
  width: number;
  maxHeightPx: number;
  /**
   * When true, `top` is the panel's bottom edge (just above the field).
   * The element is shifted up by its own height so a short list stays against
   * the field instead of hanging from a reserved max-height slot.
   */
  openedUp: boolean;
};

const GAP = 4;
const EDGE_PAD = 8;
const MIN_PANEL = 96;

/**
 * Place a `position: fixed` panel next to an anchor.
 *
 * `box` and the viewport size are visual-viewport coordinates (`getBoundingClientRect`,
 * `visualViewport.width/height`). `position: fixed` on iOS is relative to the layout
 * viewport, which shifts when the keyboard pans the page. `fixedOrigin*` is the visual
 * position of an element at `position:fixed; top:0; left:0` — subtract it so the panel
 * stays on the field instead of drifting as the keyboard scrolls.
 */
export function computeFixedDropdownRect(input: {
  box: { top: number; left: number; bottom: number; width: number };
  viewportWidth: number;
  viewportHeight: number;
  fixedOriginX: number;
  fixedOriginY: number;
  preferredMaxPx: number;
  minWidth: number;
  /** Keep the previous side while typing so the panel does not flip every keystroke. */
  preferUp: boolean;
}): FixedDropdownRect {
  const {
    box,
    viewportWidth,
    viewportHeight,
    fixedOriginX,
    fixedOriginY,
    preferredMaxPx,
    minWidth,
    preferUp,
  } = input;

  const spaceBelow = Math.max(0, viewportHeight - box.bottom - EDGE_PAD);
  const spaceAbove = Math.max(0, box.top - EDGE_PAD);
  const belowTight = spaceBelow < Math.min(preferredMaxPx, 140);
  const openedUp = preferUp ? spaceAbove > spaceBelow : belowTight && spaceAbove > spaceBelow;

  const available = openedUp ? spaceAbove : spaceBelow;
  const maxHeightPx = Math.max(MIN_PANEL, Math.min(preferredMaxPx, available || preferredMaxPx));

  const width = Math.min(Math.max(box.width, minWidth), Math.max(120, viewportWidth - EDGE_PAD * 2));
  const leftVisual = Math.min(Math.max(box.left, EDGE_PAD), viewportWidth - width - EDGE_PAD);
  // Down: top edge under the field. Up: bottom edge above the field (see openedUp).
  const topVisual = openedUp ? box.top - GAP : box.bottom + GAP;

  return {
    top: topVisual - fixedOriginY,
    left: leftVisual - fixedOriginX,
    width,
    maxHeightPx,
    openedUp,
  };
}

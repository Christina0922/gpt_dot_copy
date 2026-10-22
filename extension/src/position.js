function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeAnchorPosition({ anchor, width, height, viewportWidth, viewportHeight, placement }) {
  if (!anchor || anchor.bottom <= 0 || anchor.top >= viewportHeight || anchor.right <= 0 || anchor.left >= viewportWidth) {
    return { hidden: true };
  }
  const left = clamp(anchor.right - width - 8, 8, Math.max(8, viewportWidth - width - 8));
  const preferred = placement === "above" ? anchor.top - height - 6 : anchor.top + 8;
  const top = clamp(preferred, 8, Math.max(8, viewportHeight - height - 8));
  return { hidden: false, top, left };
}

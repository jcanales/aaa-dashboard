// Scroll an element into view, focus it if it's a control, and flash a ring —
// used by the review pages to turn banner entries (parse warnings, missing
// fields, field conflicts) into jump links.
export function flashElement(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    el.focus({ preventScroll: true })
  }
  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 1800)
}

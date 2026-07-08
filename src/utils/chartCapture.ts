/**
 * Captures a DOM element (Recharts SVG container) as a base64 PNG
 * using html2canvas at 2× device pixel ratio for crisp output.
 */
import html2canvas from 'html2canvas'

export async function captureElement(el: HTMLElement | null): Promise<string | undefined> {
  if (!el) return undefined
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

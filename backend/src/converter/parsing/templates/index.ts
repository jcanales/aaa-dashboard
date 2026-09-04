import type { Cell, TemplateParser } from '../types';
import { claveA1 } from './claveA1';

export const TEMPLATES: TemplateParser[] = [claveA1];

export function detectTemplate(cells: Cell[]): TemplateParser | null {
  return TEMPLATES.find((t) => t.detect(cells)) ?? null;
}

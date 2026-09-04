import { prisma } from '../../db';
import { TEMPLATES } from './templates';

// Per-template enable flag. A missing TemplateSetting row means enabled — so a
// fresh database has every deterministic parser on by default.
export async function listTemplateSettings(): Promise<Record<string, boolean>> {
  const rows = await prisma.templateSetting.findMany({ select: { id: true, enabled: true } });
  const byId = new Map(rows.map((r) => [r.id, r.enabled]));
  const out: Record<string, boolean> = {};
  for (const t of TEMPLATES) out[t.id] = byId.get(t.id) ?? true;
  return out;
}

export async function isTemplateEnabled(id: string): Promise<boolean> {
  const row = await prisma.templateSetting.findUnique({ where: { id }, select: { enabled: true } });
  return row?.enabled ?? true;
}

export async function setTemplateEnabled(id: string, enabled: boolean) {
  return prisma.templateSetting.upsert({
    where: { id },
    create: { id, enabled },
    update: { enabled },
  });
}

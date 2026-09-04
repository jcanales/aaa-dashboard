import { create } from 'xmlbuilder2';
// xmlbuilder2 v4's root barrel (unlike v3's) only re-exports create/builder/fragment/convert —
// the XMLBuilder type still exists, just at this subpath.
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import { APPLICATION_INFO_FIELDS, HEADER_FIELDS, BILL_OF_LADING_FIELDS, LINE_FIELDS, type FieldDef } from './fields';
import type { Ftz214Data } from './types';
import { isFieldEmpty } from './validation';

function isUnitValueShape(v: unknown): v is { value?: unknown; units?: unknown } {
  return typeof v === 'object' && v !== null && 'value' in v;
}

// Throws rather than silently emitting an empty/garbled element on a shape
// mismatch — for a customs-compliance XML feed, a silently zeroed mandatory
// quantity is worse than a loud failure during generation.
function appendFields(parent: XMLBuilder, fields: FieldDef[], data: Record<string, unknown>): void {
  for (const field of fields) {
    const raw = data[field.name];
    const el = parent.ele(field.name);

    if (field.hasUnitsAttr) {
      if (raw !== null && raw !== undefined && !isUnitValueShape(raw)) {
        throw new Error(`Field ${field.name} expects a { value, units } shape but received a bare ${typeof raw}`);
      }
      const uv = raw as { value?: unknown; units?: unknown } | null | undefined;
      el.att('Units', uv?.units != null ? String(uv.units) : '');
      if (!isFieldEmpty(field, raw)) el.txt(String(uv?.value));
    } else {
      if (raw !== null && raw !== undefined && isUnitValueShape(raw)) {
        throw new Error(`Field ${field.name} does not expect a { value, units } shape but received one`);
      }
      if (!isFieldEmpty(field, raw)) el.txt(String(raw));
    }
  }
}

export function buildFtz214Xml(data: Ftz214Data): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Data');

  appendFields(root.ele('ApplicationInformation'), APPLICATION_INFO_FIELDS, data.applicationInformation);
  appendFields(root.ele('Header'), HEADER_FIELDS, data.header);

  const detail = root.ele('Detail');
  for (const bol of data.detail.billsOfLading) {
    const bolEl = detail.ele('BillsOfLading');
    appendFields(bolEl, BILL_OF_LADING_FIELDS, bol.fields);
    for (const line of bol.lines) {
      appendFields(bolEl.ele('Line'), LINE_FIELDS, line);
    }
  }

  return root.end({ prettyPrint: true });
}

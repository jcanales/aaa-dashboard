/**
 * Seed script — demo user + sample tariff data
 * Run: npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Create a TariffChange only if rawPayloadHash not already present */
async function upsertChange(data: Parameters<typeof prisma.tariffChange.create>[0]['data']) {
  const existing = await prisma.tariffChange.findFirst({
    where: { rawPayloadHash: data.rawPayloadHash as string },
  });
  if (existing) return existing;
  return prisma.tariffChange.create({ data });
}

async function main() {
  console.log('Seeding database…');

  // ── 1. Demo user ─────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('demo1234', 10);
  const user = await prisma.user.upsert({
    where: { email: 'jcanales@jdgroup.net' },
    update: { passwordHash: hash },
    create: { email: 'jcanales@jdgroup.net', name: 'JONATHAN CANALES', role: 'broker', passwordHash: hash },
  });
  console.log(`✓ User: ${user.email}`);

  // ── 2. Tariff sources ─────────────────────────────────────────────────────────
  const [srcFR, srcCBP, srcUSITC, srcUSTR] = await Promise.all([
    prisma.tariffSource.upsert({ where: { name: 'federal_register' }, update: { lastPolled: new Date() }, create: { name: 'federal_register', lastPolled: new Date() } }),
    prisma.tariffSource.upsert({ where: { name: 'cbp_csms' },         update: { lastPolled: new Date() }, create: { name: 'cbp_csms',         lastPolled: new Date() } }),
    prisma.tariffSource.upsert({ where: { name: 'usitc_hts' },        update: { lastPolled: new Date() }, create: { name: 'usitc_hts',        lastPolled: new Date() } }),
    prisma.tariffSource.upsert({ where: { name: 'ustr' },             update: { lastPolled: new Date() }, create: { name: 'ustr',             lastPolled: new Date() } }),
  ]);
  console.log('✓ Sources: federal_register, cbp_csms, usitc_hts, ustr');

  // ── 3. Clients ────────────────────────────────────────────────────────────────
  const [cli1, cli2, cli3, cli4] = await Promise.all([
    prisma.client.upsert({ where: { code: 'JD1249' }, update: {}, create: { code: 'JD1249', name: 'HARMAN PROFESSIONAL INC',    email: 'imports@harman.com',        slackChannel: '#trade-alerts-harman', isActive: true  } }),
    prisma.client.upsert({ where: { code: 'JD1301' }, update: {}, create: { code: 'JD1301', name: 'SAMSUNG ELECTRONICS AMERICA', email: 'customs@samsung.com',        slackChannel: '#trade-alerts-sea',    isActive: true  } }),
    prisma.client.upsert({ where: { code: 'JD1089' }, update: {}, create: { code: 'JD1089', name: 'INTEL CORPORATION',           email: 'trade.compliance@intel.com', slackChannel: undefined,              isActive: true  } }),
    prisma.client.upsert({ where: { code: 'JD1450' }, update: {}, create: { code: 'JD1450', name: 'BOSCH HOME APPLIANCES',       email: 'imports@bosch-home.com',     slackChannel: '#bosch-alerts',        isActive: false } }),
  ]);
  console.log('✓ Clients: HARMAN, SAMSUNG, INTEL, BOSCH');

  // ── 4. HTS portfolios ─────────────────────────────────────────────────────────
  const portfolios = [
    { clientId: cli1.id, htsCode: '8471.30.0100', description: 'Portable digital ADP machines',    annualValue: 4200000  },
    { clientId: cli1.id, htsCode: '8517.12.0050', description: 'Telephones for cellular networks', annualValue: 8900000  },
    { clientId: cli1.id, htsCode: '8528.72.6400', description: 'Color video monitors',             annualValue: 1300000  },
    { clientId: cli1.id, htsCode: '8518.22.0000', description: 'Single loudspeakers, mounted',     annualValue: 650000   },
    { clientId: cli2.id, htsCode: '8517.62.0050', description: 'Machines for reception of voice',  annualValue: 12000000 },
    { clientId: cli2.id, htsCode: '8534.00.0020', description: 'Printed circuits',                 annualValue: 3400000  },
    { clientId: cli3.id, htsCode: '8534.00.0040', description: 'Printed circuit assemblies',       annualValue: 6700000  },
    { clientId: cli3.id, htsCode: '8544.42.9000', description: 'Electric conductors',              annualValue: 2100000  },
    { clientId: cli4.id, htsCode: '7213.91.3011', description: 'Wire rod of iron',                 annualValue: 890000   },
  ];
  for (const p of portfolios) {
    await prisma.clientHtsPortfolio.upsert({
      where: { clientId_htsCode: { clientId: p.clientId, htsCode: p.htsCode } },
      update: {},
      create: p,
    });
  }
  console.log('✓ HTS portfolios: 9 entries');

  // ── 5. Tariff changes ─────────────────────────────────────────────────────────
  const today = new Date();
  const d = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000);

  const chg1 = await upsertChange({
    sourceId: srcFR.id, rawPayloadHash: 'seed-hash-001',
    documentNumber: 'FR-2026-07312',
    title: 'Section 301 Tariff Rate Increase on Consumer Electronics from China',
    summary: 'The USTR has proposed increasing Section 301 duties on consumer electronics imported from China from 25% to 35%, affecting HTS chapters 84 and 85. The proposed rule is open for public comment through May 15, 2026.',
    impactScore: 9, impactRationale: 'High volume category — estimated 10% increase in landed cost for affected SKUs.',
    htsCodes: ['8471.30.0100', '8517.12.0050', '8528.72.6400', '8544.42.9000'],
    dutyBefore: { rate: '25%' }, dutyAfter: { rate: '35%' },
    effectiveDate: new Date('2026-07-01'), publicationDate: d(7),
    sourceUrl: 'https://www.federalregister.gov/documents/2026/04/01/example',
    status: 'pending',
  });

  const chg2 = await upsertChange({
    sourceId: srcCBP.id, rawPayloadHash: 'seed-hash-002',
    documentNumber: 'CBP-HTSUS-2026-003',
    title: 'HTSUS Classification Update — Audio Equipment Chapter 85',
    summary: 'CBP has issued a binding ruling clarifying the classification of wireless audio devices, moving certain Bluetooth speakers from 8518.22 to 8518.29 with an associated duty rate change.',
    impactScore: 6, impactRationale: 'Moderate impact — reclassification may require retroactive duty adjustments on prior entries.',
    htsCodes: ['8518.22.0000', '8518.29.0000'],
    dutyBefore: { rate: '2%' }, dutyAfter: { rate: '4.9%' },
    effectiveDate: new Date('2026-05-01'), publicationDate: d(11),
    sourceUrl: 'https://rulings.cbp.gov/ruling/example',
    status: 'pending',
  });

  const chg3 = await upsertChange({
    sourceId: srcUSITC.id, rawPayloadHash: 'seed-hash-003',
    documentNumber: 'USITC-INV-337-1234',
    title: 'Section 337 Investigation — Network Interface Devices',
    summary: 'USITC has initiated a Section 337 investigation into certain network interface devices. An exclusion order, if issued, could bar importation of affected products.',
    impactScore: 8, impactRationale: 'Potential exclusion order would halt imports of key networking products. Immediate legal review required.',
    htsCodes: ['8517.62.0050', '8517.69.0000'],
    effectiveDate: undefined, publicationDate: d(3),
    sourceUrl: 'https://www.usitc.gov/investigations/example',
    status: 'pending',
  });

  const chg4 = await upsertChange({
    sourceId: srcFR.id, rawPayloadHash: 'seed-hash-004',
    documentNumber: 'FR-2026-06891',
    title: 'Antidumping Duty Order — Printed Circuit Assemblies from Vietnam',
    summary: 'Commerce Department has issued a final antidumping duty order on printed circuit assemblies from Vietnam with rates ranging from 8.5% to 22.3% depending on manufacturer.',
    impactScore: 7, impactRationale: 'Significant cost increase for PCB supply chain. Manufacturer-specific rates require careful invoice documentation.',
    htsCodes: ['8534.00.0020', '8534.00.0040'],
    dutyBefore: { rate: '0%' }, dutyAfter: { rate: '8.5–22.3%' },
    effectiveDate: new Date('2026-04-15'), publicationDate: d(19),
    sourceUrl: 'https://www.federalregister.gov/documents/2026/03/20/example',
    status: 'approved', reviewedBy: user.id, reviewedAt: d(17), alertsSent: true,
  });

  await upsertChange({
    sourceId: srcUSTR.id, rawPayloadHash: 'seed-hash-005',
    documentNumber: 'USTR-2026-0012',
    title: 'GSP Renewal — Duty-Free Treatment for Eligible Developing Countries',
    summary: 'USTR announces renewal of the Generalized System of Preferences program, restoring duty-free treatment for eligible articles through December 31, 2027.',
    impactScore: 3, impactRationale: 'Favorable change restoring duty savings on eligible goods. Low urgency.',
    htsCodes: ['6204.62.4010', '6110.20.2075'],
    dutyBefore: { rate: '12%' }, dutyAfter: { rate: '0%' },
    effectiveDate: new Date('2026-06-01'), publicationDate: d(5),
    sourceUrl: 'https://ustr.gov/gsp/renewal-2026',
    status: 'reviewed', reviewedBy: user.id, reviewedAt: d(4),
  });

  await upsertChange({
    sourceId: srcCBP.id, rawPayloadHash: 'seed-hash-006',
    documentNumber: 'CBP-ADD-2026-008',
    title: 'ADD Rate Revision — Steel Wire Rod from Mexico',
    summary: 'CBP has revised the antidumping duty rate for steel wire rod from Mexico following an administrative review. New cash deposit rate effective immediately.',
    impactScore: 2, impactRationale: 'Minor impact — applicable only to steel wire rod.',
    htsCodes: ['7213.91.3011'],
    dutyBefore: { rate: '3.2%' }, dutyAfter: { rate: '1.8%' },
    effectiveDate: today, publicationDate: d(1),
    sourceUrl: 'https://rulings.cbp.gov/add/example',
    status: 'suppressed', reviewedBy: user.id, reviewedAt: d(1),
  });

  const chg7 = await upsertChange({
    sourceId: srcFR.id, rawPayloadHash: 'seed-hash-007',
    documentNumber: 'FR-2026-08103',
    title: 'Proposed Rule: Exclusion from Section 232 Steel Tariffs for Qualifying Products',
    summary: 'Commerce proposes a product exclusion process for downstream manufacturers unable to source domestically produced steel. Comment period open through May 30, 2026.',
    impactScore: 5, impactRationale: 'Potential tariff relief if exclusion granted. Requires filing exclusion requests by deadline.',
    htsCodes: ['7207.20.0025', '7208.51.0060'],
    dutyBefore: { rate: '25%' }, dutyAfter: { rate: 'TBD' },
    effectiveDate: undefined, publicationDate: today,
    sourceUrl: 'https://www.federalregister.gov/documents/2026/04/08/example',
    status: 'pending',
  });
  console.log('✓ Tariff changes: 7 records');

  // ── 6. Client HTS matches ─────────────────────────────────────────────────────
  await Promise.all([
    prisma.clientHtsMatch.create({ data: { changeId: chg1.id, clientId: cli1.id, matchedHtsCodes: ['8471.30.0100', '8517.12.0050', '8528.72.6400'], estimatedDutyImpact: 1340000 } }),
    prisma.clientHtsMatch.create({ data: { changeId: chg1.id, clientId: cli2.id, matchedHtsCodes: ['8517.12.0050'],  estimatedDutyImpact: 890000  } }),
    prisma.clientHtsMatch.create({ data: { changeId: chg2.id, clientId: cli1.id, matchedHtsCodes: ['8518.22.0000'],  estimatedDutyImpact: 18850   } }),
    prisma.clientHtsMatch.create({ data: { changeId: chg3.id, clientId: cli2.id, matchedHtsCodes: ['8517.62.0050'],  estimatedDutyImpact: 0       } }),
    prisma.clientHtsMatch.create({ data: { changeId: chg4.id, clientId: cli2.id, matchedHtsCodes: ['8534.00.0020'],  estimatedDutyImpact: 289000  } }),
    prisma.clientHtsMatch.create({ data: { changeId: chg4.id, clientId: cli3.id, matchedHtsCodes: ['8534.00.0040'],  estimatedDutyImpact: 570000  } }),
    prisma.clientHtsMatch.create({ data: { changeId: chg7.id, clientId: cli1.id, matchedHtsCodes: ['8471.30.0100'],  estimatedDutyImpact: 420000  } }),
  ]);
  console.log('✓ Client matches: 7 records');

  // ── 7. Alerts ─────────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.alert.create({ data: { changeId: chg4.id, clientId: cli2.id, channel: 'email', status: 'sent',   sentAt: d(17) } }),
    prisma.alert.create({ data: { changeId: chg4.id, clientId: cli2.id, channel: 'slack', status: 'sent',   sentAt: d(17) } }),
    prisma.alert.create({ data: { changeId: chg4.id, clientId: cli3.id, channel: 'email', status: 'sent',   sentAt: d(17) } }),
    prisma.alert.create({ data: { changeId: chg1.id, clientId: cli1.id, channel: 'email', status: 'queued', sentAt: undefined } }),
    prisma.alert.create({ data: { changeId: chg1.id, clientId: cli2.id, channel: 'slack', status: 'failed', sentAt: undefined } }),
  ]);
  console.log('✓ Alerts: 5 records');

  console.log('\n✅ Seed complete! Login: jcanales / demo1234');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

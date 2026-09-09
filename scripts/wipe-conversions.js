// One-off: delete ALL FTZ Converter conversions and operations. Irreversible.
// Run from backend/ so dotenv picks up .env there: node ../scripts/wipe-conversions.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const convCount = await prisma.conversion.count();
  const opCount = await prisma.operation.count();
  console.log(`Found ${convCount} conversions, ${opCount} operations. Deleting...`);

  // Operations first — cascades their OperationMember rows and any
  // Operation-linked FtzAllocation. Conversions second — cascades any
  // remaining FtzAllocation and OperationMember tied directly to them.
  const deletedOps = await prisma.operation.deleteMany({});
  const deletedConvs = await prisma.conversion.deleteMany({});

  console.log(`Deleted ${deletedOps.count} operations, ${deletedConvs.count} conversions.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

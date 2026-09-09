// One-off: create (or reset) a user directly against the production database.
// Run from backend/ so dotenv picks up .env there:
//   node ../scripts/create-admin.js <email> <password> <name> [role]
// role defaults to 'admin' if omitted. Valid roles: staff, coordinator, manager, admin.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const [email, password, name, role] = process.argv.slice(2);
const VALID_ROLES = ['staff', 'coordinator', 'manager', 'admin'];
const finalRole = role || 'admin';

if (!email || !password || !name) {
  console.error('Usage: node create-admin.js <email> <password> <name> [role]');
  console.error(`Valid roles: ${VALID_ROLES.join(', ')} (defaults to admin)`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
if (!VALID_ROLES.includes(finalRole)) {
  console.error(`Invalid role "${finalRole}". Valid roles: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: finalRole, name },
    create: { email, name, role: finalRole, passwordHash },
  });
  console.log(`OK: ${user.email} (role: ${user.role})`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

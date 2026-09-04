import bcrypt from 'bcryptjs';
import { prisma } from '../../db';

// Login itself stays on duties-dashboard's existing /api/auth/login (email +
// bcryptjs against User.passwordHash) — this module only covers admin user
// management (list/create/update/reset-password) for the Configuration page's
// Users tab, not AAA-Converter's own login flow.

export class DuplicateUserError extends Error {}
export class UserNotFoundError extends Error {}
export class LastActiveAdminError extends Error {}

// Serializes any user write that could shrink the active-admin set, so two
// concurrent demotions can't both pass a "one admin still left" check and
// leave zero. Mirrors ftzAllocationService's advisory-lock pattern.
const USER_ADMIN_LOCK_KEY = 4720;

const ADMIN_ROLE = 'admin';

// Everything the admin UI needs and nothing the API must not leak (passwordHash).
const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: PUBLIC_USER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
}

// Live check of the caller's own standing — a JWT's `role` claim is up to 8h
// stale, so a demoted or deactivated admin still presents a valid admin token.
// Gate state-changing admin routes on this, not the token alone.
export async function isActiveAdmin(id: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true, active: true } });
  return !!u && u.role === ADMIN_ROLE && u.active;
}

export async function countActiveAdmins() {
  return prisma.user.count({ where: { role: ADMIN_ROLE, active: true } });
}

export interface CreateUserInput {
  username: string;
  email: string;
  name: string;
  password: string;
  role?: string;
  active?: boolean;
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    return await prisma.user.create({
      data: {
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role: input.role ?? 'staff',
        active: input.active ?? true,
      },
      select: PUBLIC_USER_SELECT,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new DuplicateUserError('Username or email already exists');
    throw err;
  }
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  name?: string;
  role?: string;
  active?: boolean;
}

function mapWriteError(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === 'P2002') throw new DuplicateUserError('Username or email already exists');
  if (code === 'P2025') throw new UserNotFoundError('User not found');
  throw err;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const data: UpdateUserInput = {};
  if (input.username !== undefined) data.username = input.username.toLowerCase();
  if (input.email !== undefined) data.email = input.email.toLowerCase();
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.active !== undefined) data.active = input.active;

  // A change that can only keep or grow the active-admin set needs no coordination.
  const mayReduceAdmins = (data.role !== undefined && data.role !== ADMIN_ROLE) || data.active === false;
  if (!mayReduceAdmins) {
    try {
      return await prisma.user.update({ where: { id }, data, select: PUBLIC_USER_SELECT });
    } catch (err) {
      return mapWriteError(err);
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`;
    let updated;
    try {
      updated = await tx.user.update({ where: { id }, data, select: PUBLIC_USER_SELECT });
    } catch (err) {
      return mapWriteError(err);
    }
    // Re-count inside the lock+transaction: this reflects our own write and,
    // because the lock serializes the other writers, theirs once committed.
    if ((await tx.user.count({ where: { role: ADMIN_ROLE, active: true } })) === 0) {
      throw new LastActiveAdminError('At least one active admin must remain');
    }
    return updated;
  });
}

export async function setUserPassword(id: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.user.update({ where: { id }, data: { passwordHash }, select: { id: true } });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') throw new UserNotFoundError('User not found');
    throw err;
  }
}

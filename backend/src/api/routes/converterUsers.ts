import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/requireRole';
import {
  listUsers,
  createUser,
  updateUser,
  setUserPassword,
  findUserById,
  countActiveAdmins,
  isActiveAdmin,
  DuplicateUserError,
  UserNotFoundError,
  LastActiveAdminError,
  type UpdateUserInput,
} from '../../converter/services/converterUsersService';

// coordinator/manager hold `requireRole` access to this whole router (to manage
// FTZ Converter staff), but must not be able to mint or edit admin/manager/
// coordinator accounts, or reset anyone's password, themselves — a JWT's role
// claim is also up to 8h stale, so re-check the caller's *current* standing
// against the DB rather than trusting req.user.role for anything admin-gated.
const ADMIN_MANAGED_ROLES = new Set(['coordinator', 'manager', 'admin']);

const router = Router();
router.use(requireRole(['coordinator', 'manager', 'admin']));

// Deliberately simple (not RFC 5322) — just enough to reject a bare word like
// "alice" as an email, since findUserByIdentifier (duties' login route) ORs
// across username and email: an email that could also be read as a username
// collides with a same-named user.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirror image of the email check: a username containing '@' or whitespace could
// itself collide with a DIFFERENT user's email under the same OR-match lookup, with
// no unique constraint to stop it (username and email are @unique separately, not
// jointly) — this closes that direction too, not just the email-as-username one.
const USERNAME_PATTERN = /^\S+$/;

// Passwords are never trimmed (trimming a credential silently weakens it) —
// reject surrounding whitespace outright. Returns an error message, or null if ok.
function passwordError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  if (password !== password.trim()) return 'Password cannot start or end with whitespace';
  return null;
}

function usernameOk(username: string): boolean {
  return !username.includes('@') && USERNAME_PATTERN.test(username.trim());
}

// staff: FTZ Converter only. coordinator / manager: full portal access.
// admin: full portal access, reserved for future admin-only functionality.
const VALID_ROLES = ['staff', 'coordinator', 'manager', 'admin'];
function roleOk(role: unknown): role is string {
  return typeof role === 'string' && VALID_ROLES.includes(role);
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listUsers());
  } catch (err) {
    console.error('[converter:users]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { username, email, name, password, role, active } = req.body as {
    username?: unknown; email?: unknown; name?: unknown; password?: unknown; role?: unknown; active?: unknown;
  };

  if (
    typeof username !== 'string' || !username.trim() || !usernameOk(username) ||
    typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim()) ||
    typeof name !== 'string' || !name.trim() ||
    passwordError(password) !== null
  ) {
    res.status(400).json({ error: 'a username with no "@" or whitespace, a valid email, a name, and a password of at least 8 characters (no surrounding whitespace) are required' });
    return;
  }
  if (role !== undefined && !roleOk(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    return;
  }
  if (role !== undefined && ADMIN_MANAGED_ROLES.has(role) && !(await isActiveAdmin(req.user!.userId))) {
    res.status(403).json({ error: 'Only an admin can create coordinator, manager, or admin accounts' });
    return;
  }

  try {
    const created = await createUser({
      username: username.trim(),
      email: email.trim(),
      name: name.trim(),
      password: password as string,
      role: role as string | undefined,
      active: active === undefined ? undefined : active === true,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof DuplicateUserError) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error('[converter:users]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/converter/users/:id — partial update of username / email / name / role / active.
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { username, email, name, role, active } = req.body as {
    username?: unknown; email?: unknown; name?: unknown; role?: unknown; active?: unknown;
  };

  const input: UpdateUserInput = {};
  if (username !== undefined) {
    if (typeof username !== 'string' || !username.trim() || !usernameOk(username)) {
      res.status(400).json({ error: 'username must have no "@" or whitespace' });
      return;
    }
    input.username = username.trim();
  }
  if (email !== undefined) {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      res.status(400).json({ error: 'a valid email is required' });
      return;
    }
    input.email = email.trim();
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name cannot be empty' });
      return;
    }
    input.name = name.trim();
  }
  if (role !== undefined) {
    if (!roleOk(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }
    input.role = role;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') {
      res.status(400).json({ error: 'active must be a boolean' });
      return;
    }
    input.active = active;
  }

  if (Object.keys(input).length === 0) {
    res.status(400).json({ error: 'no updatable fields provided' });
    return;
  }

  try {
    const target = await findUserById(id);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Role changes, and any edit to an existing coordinator/manager/admin
    // account, require the caller to be a *live* admin — otherwise a
    // coordinator/manager could promote themselves (or anyone) to admin, or
    // silently deactivate/rename another admin's account.
    const targetIsAdminManaged = ADMIN_MANAGED_ROLES.has(target.role ?? '');
    const needsLiveAdmin = input.role !== undefined || targetIsAdminManaged;
    if (needsLiveAdmin && !(await isActiveAdmin(req.user!.userId))) {
      res.status(403).json({ error: 'Only an admin can change roles or modify a coordinator, manager, or admin account' });
      return;
    }

    const isSelf = req.user!.userId === target.id;
    if (isSelf && input.role === 'staff') {
      res.status(400).json({ error: 'You cannot demote yourself to staff — you would lose access to this page' });
      return;
    }
    if (isSelf && input.active === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    // Losing the last active admin locks everyone out of user administration.
    const wouldDropTargetAsAdmin =
      target.role === 'admin' && target.active && ((input.role !== undefined && input.role !== 'admin') || input.active === false);
    if (wouldDropTargetAsAdmin && (await countActiveAdmins()) <= 1) {
      res.status(400).json({ error: 'At least one active admin must remain' });
      return;
    }

    res.json(await updateUser(id, input));
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof DuplicateUserError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof LastActiveAdminError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[converter:users]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/converter/users/:id/reset-password — admin sets a new password for any user.
router.post('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  // No self-service "reset your own password with your old password" flow
  // exists on this router (the UI only offers this from the admin Users
  // tab) — so this stays a live-admin-only action, full stop.
  if (!(await isActiveAdmin(req.user!.userId))) {
    res.status(403).json({ error: 'Only an admin can reset a user\'s password' });
    return;
  }

  const { password } = req.body as { password?: unknown };
  const pwError = passwordError(password);
  if (pwError !== null) {
    res.status(400).json({ error: pwError });
    return;
  }

  try {
    await setUserPassword(String(req.params.id), password as string);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[converter:users]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

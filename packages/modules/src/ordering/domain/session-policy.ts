import type { GuestSessionRecord } from "./models.js";

export const guestSessionIdleTimeoutMs = 4 * 60 * 60 * 1000;
export const guestSessionAbsoluteTimeoutMs = 12 * 60 * 60 * 1000;

export function isGuestSessionValid(
  session: GuestSessionRecord,
  now: Date,
): boolean {
  if (session.revokedAtUtc) {
    return false;
  }
  if (now.getTime() >= session.expiresAtUtc.getTime()) {
    return false;
  }
  const idleDeadline =
    session.lastSeenAtUtc.getTime() + guestSessionIdleTimeoutMs;
  return now.getTime() < idleDeadline;
}

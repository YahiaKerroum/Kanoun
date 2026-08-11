import { safeStaffReturnPath } from "./staff-navigation.js";

export type StaffAuthRoute =
  "sign-in" | "recover" | "recover-complete" | "invite-accept";

export function authRouteForPath(pathname: string): StaffAuthRoute | null {
  if (pathname === "/auth/sign-in") return "sign-in";
  if (pathname === "/auth/recover") return "recover";
  if (pathname === "/auth/recover/complete") return "recover-complete";
  if (pathname === "/invite/accept") return "invite-accept";
  return null;
}

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  return safeStaffReturnPath(value, fallback);
}

export function authPath(
  route: StaffAuthRoute,
  returnTo?: string | null,
): string {
  const pathname =
    route === "sign-in"
      ? "/auth/sign-in"
      : route === "recover"
        ? "/auth/recover"
        : route === "recover-complete"
          ? "/auth/recover/complete"
          : "/invite/accept";
  if (!returnTo) return pathname;
  const query = new URLSearchParams({
    returnTo: safeInternalPath(returnTo),
  });
  return `${pathname}?${query.toString()}`;
}

export function replaceLocation(path: string): void {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function pushLocation(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export type StaffAuthRoute =
  "sign-in" | "recover" | "recover-complete" | "invite-accept";

const staffReturnPaths = new Set(["/", "/workspace"]);

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
  if (!value) return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  try {
    const url = new URL(candidate, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !staffReturnPaths.has(url.pathname)
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
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

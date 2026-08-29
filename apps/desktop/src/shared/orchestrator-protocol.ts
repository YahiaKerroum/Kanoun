export interface DesktopOrchestratorReady {
  readonly launcherOrigin: string;
}

const readyPrefix = "MISE_DESKTOP_READY ";

export function encodeReadyLine(ready: DesktopOrchestratorReady): string {
  return `${readyPrefix}${JSON.stringify(ready)}`;
}

export function parseReadyLine(line: string): DesktopOrchestratorReady | null {
  if (!line.startsWith(readyPrefix)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(line.slice(readyPrefix.length));
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("launcherOrigin" in payload) ||
    typeof payload.launcherOrigin !== "string"
  ) {
    return null;
  }
  return { launcherOrigin: payload.launcherOrigin };
}

export async function startReactDiagnostics(): Promise<void> {
  if (
    !import.meta.env.DEV ||
    import.meta.env.VITE_DISABLE_REACT_DIAGNOSTICS === "true"
  ) {
    return;
  }

  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

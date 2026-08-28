export interface ResetDemoDataDependencies {
  closeRoleWindows(): void;
  requestReset(): Promise<void>;
  reopenHomeWindow(): void;
}

export async function performDemoDataReset(
  dependencies: ResetDemoDataDependencies,
): Promise<void> {
  dependencies.closeRoleWindows();
  await dependencies.requestReset();
  dependencies.reopenHomeWindow();
}

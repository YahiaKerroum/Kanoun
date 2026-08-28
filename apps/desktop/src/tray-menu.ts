import type { MenuItemConstructorOptions } from "electron";
import type { RoleWindowHandle } from "./window-registry.js";

export interface TrayMenuActions {
  readonly openHome: () => void;
  readonly resetDemoData: () => void;
  readonly quit: () => void;
}

export function buildTrayMenuTemplate(
  windows: readonly RoleWindowHandle[],
  actions: TrayMenuActions,
): MenuItemConstructorOptions[] {
  const windowItems: MenuItemConstructorOptions[] =
    windows.length === 0
      ? [{ label: "No role windows open", enabled: false }]
      : windows.map((handle) => ({
          label: handle.label,
          click: () => handle.focus(),
        }));
  return [
    { label: "Open home window", click: () => actions.openHome() },
    { type: "separator" },
    ...windowItems,
    { type: "separator" },
    { label: "Reset demo data", click: () => actions.resetDemoData() },
    { type: "separator" },
    { label: "Quit", click: () => actions.quit() },
  ];
}

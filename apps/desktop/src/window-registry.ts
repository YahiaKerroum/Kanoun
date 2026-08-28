export interface RoleWindowHandle {
  readonly id: number;
  readonly roleKey: string;
  readonly label: string;
  close(): void;
  focus(): void;
}

export class WindowRegistry {
  #windows = new Map<number, RoleWindowHandle>();

  register(handle: RoleWindowHandle): void {
    this.#windows.set(handle.id, handle);
  }

  unregister(id: number): void {
    this.#windows.delete(id);
  }

  list(): readonly RoleWindowHandle[] {
    return [...this.#windows.values()];
  }

  closeAll(): void {
    for (const handle of this.#windows.values()) {
      handle.close();
    }
    this.#windows.clear();
  }
}

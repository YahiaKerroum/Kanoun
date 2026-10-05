import process from "node:process";

/** Messages the runtime host and its API/worker children exchange over IPC. */
export interface ChildMessage {
  readonly type: "ready";
}
export interface HostMessage {
  readonly type: "shutdown";
}

export function isMessage<T extends string>(
  message: unknown,
  type: T,
): message is { readonly type: T } {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === type
  );
}

export function reportReady(): void {
  process.send?.({ type: "ready" } satisfies ChildMessage);
}

/**
 * Runs `handler` once when the host asks for a graceful stop, or when the IPC
 * channel closes because the host itself went away.
 */
export function onShutdownRequest(handler: () => unknown): void {
  let called = false;
  const once = (): void => {
    if (!called) {
      called = true;
      void handler();
    }
  };
  process.on("message", (message: unknown) => {
    if (isMessage(message, "shutdown")) {
      once();
    }
  });
  process.once("disconnect", once);
}

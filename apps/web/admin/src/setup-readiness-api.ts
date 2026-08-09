import { z } from "zod";

const setupRequestTimeoutMs = 15_000;

export class SetupApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SetupApiError";
  }
}

export function csrfToken(): string {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("rms_csrf="))
      ?.slice(9) ?? ""
  );
}

export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function setupApi<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body !== undefined) headers.set("content-type", "application/json");
  if (init?.method && init.method !== "GET") {
    headers.set("x-csrf-token", csrfToken());
  }
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, setupRequestTimeoutMs);
  const abortRequest = () => controller.abort();
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", abortRequest, { once: true });
    }
  }
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const problem = z
        .object({ title: z.string(), detail: z.string().nullable().optional() })
        .safeParse(await response.json().catch(() => undefined));
      throw new SetupApiError(
        response.status,
        problem.success
          ? (problem.data.detail ?? problem.data.title)
          : response.status === 401
            ? "Your session ended. Sign in again to continue."
            : response.status === 403
              ? "Your current permissions do not allow this setup action."
              : response.status === 409
                ? "This record changed elsewhere. Reload it before saving."
                : "The setup request failed. Refresh and try again.",
      );
    }
    return schema.parse(await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SetupApiError(
        408,
        "The setup request timed out or was cancelled. Refresh and try again.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    init?.signal?.removeEventListener("abort", abortRequest);
  }
}

export async function optionalSetupApi<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T | null> {
  try {
    return await setupApi(path, schema, init);
  } catch (error) {
    if (
      error instanceof SetupApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      return null;
    }
    throw error;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "The server returned setup data that does not match the published contract.";
  }
  return error instanceof Error
    ? error.message
    : "The setup data could not be loaded. Refresh and try again.";
}

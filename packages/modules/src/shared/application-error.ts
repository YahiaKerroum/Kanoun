export type ApplicationErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "resource_not_found"
  | "invalid_state_transition"
  | "concurrency_conflict"
  | "validation_error"
  | "rate_limited"
  | "service_unavailable";

export class ApplicationError extends Error {
  public constructor(
    public readonly code: ApplicationErrorCode,
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly currentVersion?: number,
  ) {
    super(title);
    this.name = "ApplicationError";
  }
}

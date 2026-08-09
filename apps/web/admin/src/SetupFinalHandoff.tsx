export interface SetupFinalHandoffProps {
  readonly coreReady: boolean;
  readonly canViewEmployees: boolean;
  readonly canUseStaffWorkspace: boolean;
  readonly staffOrigin: string;
  readonly message: string;
}

export function SetupFinalHandoff({
  coreReady,
  canViewEmployees,
  canUseStaffWorkspace,
  staffOrigin,
  message,
}: SetupFinalHandoffProps) {
  return (
    <section className="admin-section" aria-labelledby="final-review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Handoff gate</p>
          <h3 id="final-review-title">Ready for service?</h3>
        </div>
        <span>
          {coreReady ? "Core setup complete" : "Complete blocked items first"}
        </span>
      </div>
      <p className="section-detail">
        {coreReady
          ? "The identity, branch context, hours, workforce, and approved feature prerequisites are ready for a Staff handoff. Menu, tables, and QR readiness remain visible above so the owner can finish the service path."
          : "Staff access stays behind the core setup gate. Use the direct links above to resolve each blocked item; refresh after every server-side change."}
      </p>
      <div className="setup-final-actions">
        {canViewEmployees ? (
          <a className="secondary-action" href="/employees">
            Open Workforce
          </a>
        ) : null}
        {canUseStaffWorkspace && coreReady ? (
          <a
            className="primary-action setup-link-button"
            href={`${staffOrigin}/`}
          >
            Open Staff workspace
          </a>
        ) : null}
        <a className="secondary-action" href="/menu">
          Review Menu
        </a>
        <a className="secondary-action" href="/tables">
          Review Tables &amp; QR
        </a>
      </div>
      <p className="status-line" role="status" aria-live="polite">
        {message || ""}
      </p>
    </section>
  );
}

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
          <h3 id="final-review-title">Ready for service?</h3>
        </div>
        <span>
          {coreReady ? "Core setup complete" : "Complete blocked items first"}
        </span>
      </div>
      <p className="section-detail">
        {coreReady
          ? "The essentials are done. Your team can sign in and start service. Finish any menu, table, or QR items above when you're ready."
          : "Finish the items marked above before your team starts service. Each one links straight to where it's fixed."}
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

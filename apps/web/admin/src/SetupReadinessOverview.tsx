import {
  statusClass,
  statusIcon,
  statusLabel,
} from "./setup-readiness-model.js";
import type { Branch, ReadinessItem } from "./setup-readiness-model.js";

export interface SetupReadinessOverviewProps {
  readonly selectedBranch: Branch | undefined;
  readonly readiness: readonly ReadinessItem[];
  readonly blockingCount: number;
  readonly requiredAttentionCount: number;
  readonly optionalAttentionCount: number;
  readonly coreReady: boolean;
  readonly pendingAction: string;
  readonly onReload: () => void;
}

export function SetupReadinessOverview({
  selectedBranch,
  readiness,
  blockingCount,
  requiredAttentionCount,
  optionalAttentionCount,
  coreReady,
  pendingAction,
  onReload,
}: SetupReadinessOverviewProps) {
  return (
    <>
      <section className="setup-hero" aria-labelledby="setup-readiness-title">
        <div>
          <p className="eyebrow">Guided owner setup</p>
          <h3 id="setup-readiness-title">Service readiness review</h3>
          <p>
            This checklist is recalculated from the latest restaurant, branch,
            workforce, feature, menu, table, and QR responses. It is safe to
            resume from any direct link.
          </p>
        </div>
        <div className="setup-hero__summary" aria-label="Setup summary">
          <strong>
            {blockingCount > 0
              ? "Blocked"
              : coreReady
                ? "Core setup complete"
                : "Needs setup"}
          </strong>
          <span>
            {blockingCount} blocked · {requiredAttentionCount} need setup
            {optionalAttentionCount > 0
              ? ` · ${optionalAttentionCount} optional`
              : ""}
          </span>
          <button
            type="button"
            onClick={onReload}
            disabled={pendingAction.length > 0}
          >
            Refresh server state
          </button>
        </div>
      </section>

      <section
        className="admin-section operational-admin-section"
        aria-labelledby="readiness-review-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">No client completion flag</p>
            <h3 id="readiness-review-title">Readiness checklist</h3>
          </div>
          <span>{selectedBranch?.name ?? "No branch selected"}</span>
        </div>
        <div className="readiness-list">
          {readiness.map((item) => (
            <article className={statusClass(item.status)} key={item.id}>
              <div className="readiness-item__icon" aria-hidden="true">
                {statusIcon(item.status)}
              </div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
              </div>
              <span className="readiness-item__status">
                {statusLabel(item.status)}
              </span>
              {item.href ? <a href={item.href}>Open</a> : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

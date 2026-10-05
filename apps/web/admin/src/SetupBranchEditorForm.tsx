import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import {
  branchStatusFrom,
  serviceStatusFrom,
} from "./setup-readiness-model.js";
import { SetupBranchContextFields } from "./SetupBranchContextFields.js";
import { SetupHoursEditor } from "./SetupHoursEditor.js";
import type {
  Branch,
  BranchDraft,
  HoursDraft,
} from "./setup-readiness-model.js";

export interface SetupBranchEditorFormProps {
  readonly selectedBranch: Branch;
  readonly branchDraft: BranchDraft;
  readonly serviceReason: string;
  readonly pendingAction: string;
  readonly setBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setServiceReason: Dispatch<SetStateAction<string>>;
  readonly updateHours: (index: number, patch: Partial<HoursDraft>) => void;
  readonly saveBranch: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
}

export function SetupBranchEditorForm({
  branchDraft,
  serviceReason,
  pendingAction,
  setBranchDraft,
  setServiceReason,
  updateHours,
  saveBranch,
}: SetupBranchEditorFormProps) {
  return (
    <form
      className="selected-record record-editor setup-branch-editor"
      onSubmit={(event) => void saveBranch(event)}
    >
      <label>
        Branch name
        <input
          value={branchDraft.name}
          onChange={(event) =>
            setBranchDraft((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          required
        />
      </label>
      <label>
        IANA time zone
        <input
          value={branchDraft.timeZone}
          onChange={(event) =>
            setBranchDraft((current) => ({
              ...current,
              timeZone: event.target.value,
            }))
          }
          required
        />
      </label>
      <label>
        ISO currency
        <input
          value={branchDraft.currency}
          maxLength={3}
          onChange={(event) =>
            setBranchDraft((current) => ({
              ...current,
              currency: event.target.value.toUpperCase(),
            }))
          }
          required
        />
      </label>
      <label>
        Branch status
        <select
          value={branchDraft.status}
          onChange={(event) =>
            setBranchDraft((current) => ({
              ...current,
              status: branchStatusFrom(event.target.value),
            }))
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <label>
        Service status
        <select
          value={branchDraft.serviceStatus}
          onChange={(event) =>
            setBranchDraft((current) => ({
              ...current,
              serviceStatus: serviceStatusFrom(event.target.value),
            }))
          }
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="temporarily_unavailable">
            Temporarily unavailable
          </option>
        </select>
      </label>
      <label className="record-editor__wide">
        Explanation for a closed or temporarily unavailable status
        <textarea
          value={serviceReason}
          minLength={8}
          maxLength={500}
          placeholder="Explain the operational reason when changing service status."
          onChange={(event) => setServiceReason(event.target.value)}
        />
      </label>
      <SetupBranchContextFields
        branchDraft={branchDraft}
        setBranchDraft={setBranchDraft}
      />
      <div className="record-editor__wide">
        <SetupHoursEditor hours={branchDraft.hours} onChange={updateHours} />
        <p className="setup-form-note">
          Orders already taken can finish after closing time. New orders are
          refused outside opening hours, on closure days, or while the branch is
          paused.
        </p>
      </div>
      <label className="checkbox-line record-editor__wide">
        <input
          type="checkbox"
          checked={branchDraft.allowOrderOverride}
          onChange={(event) =>
            setBranchDraft((current) => ({
              ...current,
              allowOrderOverride: event.target.checked,
            }))
          }
        />
        Keep taking orders when the branch is paused or outside opening hours
      </label>
      <button type="submit" disabled={pendingAction.length > 0}>
        Save branch and hours
      </button>
      <p className="setup-form-note">
        Opening periods can't overlap. If someone else saved this branch first,
        reload before saving.
      </p>
    </form>
  );
}

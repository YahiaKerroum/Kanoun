import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import { SetupBranchCreationForm } from "./SetupBranchCreationForm.js";
import { SetupBranchEditorForm } from "./SetupBranchEditorForm.js";
import type {
  Branch,
  BranchDraft,
  HoursDraft,
  SetupData,
} from "./setup-readiness-model.js";

export interface SetupBranchSectionProps {
  readonly data: SetupData;
  readonly selectedBranch: Branch | undefined;
  readonly selectedBranchId: string;
  readonly newBranchRestaurantId: string;
  readonly branchDraft: BranchDraft;
  readonly newBranchDraft: BranchDraft;
  readonly serviceReason: string;
  readonly pendingAction: string;
  readonly canManageBranches: boolean;
  readonly setNewBranchRestaurantId: Dispatch<SetStateAction<string>>;
  readonly setBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setNewBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setServiceReason: Dispatch<SetStateAction<string>>;
  readonly onSelectBranch: (branchId: string) => void;
  readonly updateHours: (index: number, patch: Partial<HoursDraft>) => void;
  readonly updateNewBranchHours: (
    index: number,
    patch: Partial<HoursDraft>,
  ) => void;
  readonly createBranch: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
  readonly saveBranch: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
}

export function SetupBranchSection({
  data,
  selectedBranch,
  selectedBranchId,
  newBranchRestaurantId,
  branchDraft,
  newBranchDraft,
  serviceReason,
  pendingAction,
  canManageBranches,
  setNewBranchRestaurantId,
  setBranchDraft,
  setNewBranchDraft,
  setServiceReason,
  onSelectBranch,
  updateHours,
  updateNewBranchHours,
  createBranch,
  saveBranch,
}: SetupBranchSectionProps) {
  return (
    <section
      className="admin-section"
      id="branch-editor"
      aria-labelledby="branch-setup-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Branch-scoped operating context</p>
          <h3 id="branch-setup-title">Branches</h3>
        </div>
        <label className="setup-select-label">
          Review branch
          <select
            value={selectedBranchId}
            onChange={(event) => onSelectBranch(event.target.value)}
          >
            <option value="">Select a branch</option>
            {data.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {canManageBranches ? (
        <SetupBranchCreationForm
          restaurants={data.restaurants}
          newBranchRestaurantId={newBranchRestaurantId}
          newBranchDraft={newBranchDraft}
          pendingAction={pendingAction}
          setNewBranchRestaurantId={setNewBranchRestaurantId}
          setNewBranchDraft={setNewBranchDraft}
          updateNewBranchHours={updateNewBranchHours}
          createBranch={createBranch}
        />
      ) : (
        <p className="setup-form-note">
          Branch creation is unavailable for this permission scope.
        </p>
      )}
      {selectedBranch && canManageBranches ? (
        <SetupBranchEditorForm
          selectedBranch={selectedBranch}
          branchDraft={branchDraft}
          serviceReason={serviceReason}
          pendingAction={pendingAction}
          setBranchDraft={setBranchDraft}
          setServiceReason={setServiceReason}
          updateHours={updateHours}
          saveBranch={saveBranch}
        />
      ) : selectedBranch ? (
        <p className="setup-form-note">
          Branch details are read-only for this permission scope.
        </p>
      ) : (
        <p className="empty-state">
          Create or select a branch to edit address, contact, hours, time zone,
          currency, and service status.
        </p>
      )}
    </section>
  );
}

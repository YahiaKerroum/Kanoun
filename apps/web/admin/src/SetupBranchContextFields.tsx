import type { Dispatch, SetStateAction } from "react";
import type { BranchDraft } from "./setup-readiness-model.js";

export interface SetupBranchContextFieldsProps {
  readonly branchDraft: BranchDraft;
  readonly setBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
}

export function SetupBranchContextFields({
  branchDraft,
  setBranchDraft,
}: SetupBranchContextFieldsProps) {
  return (
    <>
      <fieldset className="setup-fieldset record-editor__wide">
        <legend>Address</legend>
        <div className="setup-field-grid">
          <label>
            Line 1
            <input
              value={branchDraft.line1}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  line1: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            Line 2
            <input
              value={branchDraft.line2}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  line2: event.target.value,
                }))
              }
            />
          </label>
          <label>
            City
            <input
              value={branchDraft.city}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  city: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            Region
            <input
              value={branchDraft.region}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  region: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Postal code
            <input
              value={branchDraft.postalCode}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  postalCode: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Country code
            <input
              value={branchDraft.countryCode}
              maxLength={2}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  countryCode: event.target.value.toUpperCase(),
                }))
              }
              required
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="setup-fieldset record-editor__wide">
        <legend>Contact</legend>
        <div className="setup-field-grid">
          <label>
            Work email
            <input
              type="email"
              value={branchDraft.email}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Phone
            <input
              value={branchDraft.phone}
              onChange={(event) =>
                setBranchDraft((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
            />
          </label>
        </div>
      </fieldset>
    </>
  );
}

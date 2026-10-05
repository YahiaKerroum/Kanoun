import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import { SetupHoursEditor } from "./SetupHoursEditor.js";
import type { BranchDraft, Restaurant } from "./setup-readiness-model.js";

export interface SetupBranchCreationFormProps {
  readonly restaurants: readonly Restaurant[];
  readonly newBranchRestaurantId: string;
  readonly newBranchDraft: BranchDraft;
  readonly pendingAction: string;
  readonly setNewBranchRestaurantId: Dispatch<SetStateAction<string>>;
  readonly setNewBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly updateNewBranchHours: (
    index: number,
    patch: Partial<BranchDraft["hours"][number]>,
  ) => void;
  readonly createBranch: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
}

export function SetupBranchCreationForm({
  restaurants,
  newBranchRestaurantId,
  newBranchDraft,
  pendingAction,
  setNewBranchRestaurantId,
  setNewBranchDraft,
  updateNewBranchHours,
  createBranch,
}: SetupBranchCreationFormProps) {
  return (
    <form
      className="inline-form setup-form-grid setup-create-branch-form"
      onSubmit={(event) => void createBranch(event)}
    >
      <label>
        New branch name
        <input
          name="newBranchName"
          maxLength={160}
          value={newBranchDraft.name}
          onChange={(event) =>
            setNewBranchDraft((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          required
        />
      </label>
      <label>
        Restaurant
        <select
          name="branchRestaurantId"
          value={newBranchRestaurantId}
          onChange={(event) => setNewBranchRestaurantId(event.target.value)}
          required
        >
          <option value="">Select restaurant</option>
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="setup-fieldset record-editor__wide">
        <legend>New branch context</legend>
        <div className="setup-field-grid">
          <label>
            Address line 1
            <input
              value={newBranchDraft.line1}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  line1: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            Address line 2
            <input
              value={newBranchDraft.line2}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  line2: event.target.value,
                }))
              }
            />
          </label>
          <label>
            City
            <input
              value={newBranchDraft.city}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
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
              value={newBranchDraft.region}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  region: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Postal code
            <input
              value={newBranchDraft.postalCode}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  postalCode: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Country code
            <input
              value={newBranchDraft.countryCode}
              maxLength={2}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  countryCode: event.target.value.toUpperCase(),
                }))
              }
              required
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={newBranchDraft.email}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Contact phone
            <input
              value={newBranchDraft.phone}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
            />
          </label>
          <label>
            IANA time zone
            <input
              value={newBranchDraft.timeZone}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
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
              value={newBranchDraft.currency}
              maxLength={3}
              onChange={(event) =>
                setNewBranchDraft((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase(),
                }))
              }
              required
            />
          </label>
        </div>
      </fieldset>
      <div className="record-editor__wide">
        <SetupHoursEditor
          id="new-hours-editor"
          hours={newBranchDraft.hours}
          onChange={updateNewBranchHours}
        />
      </div>
      <button type="submit" disabled={pendingAction.length > 0}>
        Create branch
      </button>
      <p>
        New branches start closed. Add hours and finish the checklist before
        opening.
      </p>
    </form>
  );
}

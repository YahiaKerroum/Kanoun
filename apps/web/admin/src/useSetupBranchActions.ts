import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import {
  branchSchema,
  describeError,
  emptyBranchDraft,
  formText,
  hoursFromDraft,
  setupApi,
} from "./setup-readiness-model.js";
import type {
  Branch,
  BranchDraft,
  HoursDraft,
} from "./setup-readiness-model.js";
import { addressFromDraft, contactFromDraft } from "./setup-branch-payloads.js";

interface SetupBranchActionsInput {
  readonly selectedBranch: Branch | undefined;
  readonly newBranchRestaurantId: string;
  readonly branchDraft: BranchDraft;
  readonly newBranchDraft: BranchDraft;
  readonly serviceReason: string;
  readonly setBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setNewBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setServiceReason: Dispatch<SetStateAction<string>>;
  readonly setMessage: Dispatch<SetStateAction<string>>;
  readonly setPendingAction: Dispatch<SetStateAction<string>>;
  readonly reload: (
    preferredBranchId: string | null,
    preferredRestaurantId?: string | null,
  ) => Promise<void>;
}

export interface SetupBranchActions {
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

export function createSetupBranchActions({
  selectedBranch,
  newBranchRestaurantId,
  branchDraft,
  newBranchDraft,
  serviceReason,
  setBranchDraft,
  setNewBranchDraft,
  setServiceReason,
  setMessage,
  setPendingAction,
  reload,
}: SetupBranchActionsInput): SetupBranchActions {
  function updateHours(index: number, patch: Partial<HoursDraft>): void {
    setBranchDraft((current) => ({
      ...current,
      hours: current.hours.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...patch } : day,
      ),
    }));
  }

  function updateNewBranchHours(
    index: number,
    patch: Partial<HoursDraft>,
  ): void {
    setNewBranchDraft((current) => ({
      ...current,
      hours: current.hours.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...patch } : day,
      ),
    }));
  }

  async function createBranch(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const restaurantId = newBranchRestaurantId;
    const name = formText(formData, "newBranchName");
    if (!restaurantId || !name) {
      setMessage(
        "Select a restaurant and enter a branch name before creating it.",
      );
      return;
    }
    const hours = hoursFromDraft(newBranchDraft.hours);
    if (hours.length === 0) {
      setMessage(
        "Select at least one opening day. A fully closed branch needs an explicit product decision.",
      );
      return;
    }
    const address = addressFromDraft(newBranchDraft);
    const contact = contactFromDraft(newBranchDraft);
    if (
      !address.line1 ||
      !address.city ||
      !/^[A-Z]{2}$/.test(address.countryCode) ||
      (!contact.email && !contact.phone)
    ) {
      setMessage(
        "Branch address, two-letter country code, and one contact method are required.",
      );
      return;
    }
    setPendingAction("Creating branch");
    try {
      const branch = await setupApi("/api/v1/staff/branches", branchSchema, {
        method: "POST",
        body: JSON.stringify({
          restaurantId,
          name,
          address,
          contact,
          timeZone: newBranchDraft.timeZone,
          currency: newBranchDraft.currency,
          openingHours: hours,
        }),
      });
      await reload(branch.id);
      setNewBranchDraft(emptyBranchDraft());
      setMessage(
        "Branch created in a closed state. Review hours and service status before opening it.",
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setPendingAction("");
    }
  }

  async function saveBranch(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedBranch) {
      setMessage("Select a branch before saving.");
      return;
    }
    const hours = hoursFromDraft(branchDraft.hours);
    if (hours.length === 0) {
      setMessage(
        "Select at least one opening day. The server will continue to guard order acceptance.",
      );
      return;
    }
    if (branchDraft.serviceStatus !== selectedBranch.serviceStatus) {
      if (
        branchDraft.serviceStatus !== "open" &&
        serviceReason.trim().length < 8
      ) {
        setMessage(
          "Explain a closed or temporarily unavailable service status in at least 8 characters.",
        );
        return;
      }
      if (
        !window.confirm(
          `Change service status to ${branchDraft.serviceStatus.replaceAll("_", " ")}? New submissions follow this server-side guard.`,
        )
      ) {
        return;
      }
    }
    if (
      branchDraft.status === "inactive" &&
      selectedBranch.status === "active" &&
      !window.confirm(
        "Deactivate this branch? Existing history is preserved and new work is blocked.",
      )
    ) {
      return;
    }
    setPendingAction("Saving branch");
    try {
      await setupApi(
        `/api/v1/staff/branches/${selectedBranch.id}`,
        branchSchema,
        {
          method: "PATCH",
          headers: { "if-match": `"${selectedBranch.version}"` },
          body: JSON.stringify({
            name: branchDraft.name,
            address: addressFromDraft(branchDraft),
            contact: contactFromDraft(branchDraft),
            timeZone: branchDraft.timeZone,
            currency: branchDraft.currency,
            status: branchDraft.status,
            serviceStatus: branchDraft.serviceStatus,
            allowOrderOverride: branchDraft.allowOrderOverride,
            openingHours: hours,
            ...(serviceReason.trim() ? { reason: serviceReason.trim() } : {}),
          }),
        },
      );
      await reload(selectedBranch.id);
      setServiceReason("");
      setMessage(
        "Branch saved. Server-side hours and service-status rules remain authoritative.",
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setPendingAction("");
    }
  }

  return { updateHours, updateNewBranchHours, createBranch, saveBranch };
}

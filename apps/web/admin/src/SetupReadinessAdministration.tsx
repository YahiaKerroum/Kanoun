import { SetupBranchSection } from "./SetupBranchSection.js";
import { SetupFinalHandoff } from "./SetupFinalHandoff.js";
import { SetupReadinessOverview } from "./SetupReadinessOverview.js";
import { SetupRestaurantSection } from "./SetupRestaurantSection.js";
import { buildReadiness } from "./setup-readiness-model.js";
import { createSetupBranchActions } from "./useSetupBranchActions.js";
import { useSetupReadinessData } from "./useSetupReadinessData.js";
import { createSetupRestaurantActions } from "./useSetupRestaurantActions.js";

export interface SetupReadinessAdministrationProps {
  readonly initialBranchId: string | null;
  readonly staffOrigin: string;
  readonly canUseStaffWorkspace: (
    branch: { readonly id: string; readonly restaurantId: string } | undefined,
  ) => boolean;
  readonly canEditRestaurants: boolean;
  readonly canManageBranches: boolean;
  readonly canViewEmployees: boolean;
}

export function SetupReadinessAdministration({
  initialBranchId,
  staffOrigin,
  canUseStaffWorkspace,
  canEditRestaurants,
  canManageBranches,
  canViewEmployees,
}: SetupReadinessAdministrationProps) {
  const controller = useSetupReadinessData(initialBranchId);
  const {
    loadState,
    selectedRestaurantId,
    newBranchRestaurantId,
    selectedBranchId,
    restaurantName,
    restaurantStatus,
    branchDraft,
    newBranchDraft,
    serviceReason,
    message,
    pendingAction,
    setNewBranchRestaurantId,
    setRestaurantName,
    setRestaurantStatus,
    setBranchDraft,
    setNewBranchDraft,
    setServiceReason,
    setMessage,
    setPendingAction,
    reload,
    selectRestaurant,
  } = controller;

  if (loadState.kind === "loading") {
    return (
      <section className="admin-section admin-loading" aria-live="polite">
        Loading setup…
      </section>
    );
  }
  if (loadState.kind === "error") {
    return (
      <section className="admin-section admin-load-error" role="alert">
        <h3>Setup couldn't load</h3>
        <p>{loadState.message}</p>
        <button
          type="button"
          onClick={() =>
            void reload(selectedBranchId || null, selectedRestaurantId || null)
          }
        >
          Reload setup
        </button>
      </section>
    );
  }

  const { data } = loadState;
  const selectedBranch = data.branches.find(
    (branch) => branch.id === selectedBranchId,
  );
  const readiness = buildReadiness(data, selectedBranch, selectedRestaurantId);
  const blockingCount = readiness.filter(
    (item) => item.status === "blocked",
  ).length;
  const attentionCount = readiness.filter(
    (item) => item.status === "attention",
  ).length;
  const optionalAttentionCount = readiness.filter(
    (item) => item.id === "browse-qr" && item.status === "attention",
  ).length;
  const requiredAttentionCount = attentionCount - optionalAttentionCount;
  const coreReady = readiness
    .filter((item) =>
      [
        "restaurant",
        "branch",
        "hours",
        "service",
        "workforce",
        "features",
      ].includes(item.id),
    )
    .every((item) => item.status === "ready");
  const canUseSelectedStaffWorkspace = canUseStaffWorkspace(
    selectedBranch
      ? { id: selectedBranch.id, restaurantId: selectedBranch.restaurantId }
      : undefined,
  );
  const restaurantActions = createSetupRestaurantActions({
    data,
    selectedRestaurantId,
    selectedBranchId,
    setMessage,
    setPendingAction,
    reload,
  });
  const branchActions = createSetupBranchActions({
    selectedBranch,
    branchDraft,
    newBranchDraft,
    newBranchRestaurantId,
    serviceReason,
    setBranchDraft,
    setNewBranchDraft,
    setServiceReason,
    setMessage,
    setPendingAction,
    reload,
  });

  return (
    <div className="setup-readiness">
      <SetupReadinessOverview
        selectedBranch={selectedBranch}
        readiness={readiness}
        blockingCount={blockingCount}
        requiredAttentionCount={requiredAttentionCount}
        optionalAttentionCount={optionalAttentionCount}
        coreReady={coreReady}
        pendingAction={pendingAction}
        onReload={() =>
          void reload(selectedBranchId || null, selectedRestaurantId || null)
        }
      />
      <SetupRestaurantSection
        data={data}
        selectedRestaurantId={selectedRestaurantId}
        restaurantName={restaurantName}
        restaurantStatus={restaurantStatus}
        pendingAction={pendingAction}
        canEditRestaurants={canEditRestaurants}
        onSelectRestaurant={selectRestaurant}
        setRestaurantName={setRestaurantName}
        setRestaurantStatus={setRestaurantStatus}
        createRestaurant={restaurantActions.createRestaurant}
        saveRestaurant={restaurantActions.saveRestaurant}
      />
      <SetupBranchSection
        data={data}
        selectedBranch={selectedBranch}
        selectedBranchId={selectedBranchId}
        newBranchRestaurantId={newBranchRestaurantId}
        branchDraft={branchDraft}
        newBranchDraft={newBranchDraft}
        serviceReason={serviceReason}
        pendingAction={pendingAction}
        canManageBranches={canManageBranches}
        setNewBranchRestaurantId={setNewBranchRestaurantId}
        setBranchDraft={setBranchDraft}
        setNewBranchDraft={setNewBranchDraft}
        setServiceReason={setServiceReason}
        onSelectBranch={(branchId) =>
          void reload(branchId || null, selectedRestaurantId || null)
        }
        updateHours={branchActions.updateHours}
        updateNewBranchHours={branchActions.updateNewBranchHours}
        createBranch={branchActions.createBranch}
        saveBranch={branchActions.saveBranch}
      />
      <SetupFinalHandoff
        coreReady={coreReady}
        canViewEmployees={canViewEmployees}
        canUseStaffWorkspace={canUseSelectedStaffWorkspace}
        staffOrigin={staffOrigin}
        message={message}
      />
    </div>
  );
}

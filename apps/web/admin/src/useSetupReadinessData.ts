import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { z } from "zod";
import {
  branchSchema,
  categorySchema,
  describeError,
  dishSchema,
  draftFromBranch,
  employeeSchema,
  emptyBranchDraft,
  featureResultSchema,
  optionalSetupApi,
  qrSchema,
  restaurantSchema,
  setupApi,
  tableSchema,
} from "./setup-readiness-model.js";
import type {
  BranchDraft,
  Category,
  Dish,
  FeatureResult,
  LoadState,
  QrCodeRecord,
  Restaurant,
  SetupData,
  TableRecord,
} from "./setup-readiness-model.js";

export interface SetupReloadGuard {
  readonly begin: () => AbortController;
  readonly isCurrent: (controller: AbortController) => boolean;
  readonly finish: (controller: AbortController) => void;
  readonly cancel: () => void;
}

export function createSetupReloadGuard(): SetupReloadGuard {
  let current: AbortController | null = null;
  return {
    begin() {
      current?.abort();
      current = new AbortController();
      return current;
    },
    isCurrent(controller) {
      return current === controller && !controller.signal.aborted;
    },
    finish(controller) {
      if (current === controller) current = null;
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}

export interface SetupReadinessDataController {
  readonly loadState: LoadState;
  readonly selectedRestaurantId: string;
  readonly newBranchRestaurantId: string;
  readonly selectedBranchId: string;
  readonly restaurantName: string;
  readonly restaurantStatus: Restaurant["status"];
  readonly branchDraft: BranchDraft;
  readonly newBranchDraft: BranchDraft;
  readonly serviceReason: string;
  readonly message: string;
  readonly pendingAction: string;
  readonly setNewBranchRestaurantId: Dispatch<SetStateAction<string>>;
  readonly setSelectedBranchId: Dispatch<SetStateAction<string>>;
  readonly setRestaurantName: Dispatch<SetStateAction<string>>;
  readonly setRestaurantStatus: Dispatch<SetStateAction<Restaurant["status"]>>;
  readonly setBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setNewBranchDraft: Dispatch<SetStateAction<BranchDraft>>;
  readonly setServiceReason: Dispatch<SetStateAction<string>>;
  readonly setMessage: Dispatch<SetStateAction<string>>;
  readonly setPendingAction: Dispatch<SetStateAction<string>>;
  readonly reload: (
    preferredBranchId: string | null,
    preferredRestaurantId?: string | null,
  ) => Promise<void>;
  readonly selectRestaurant: (restaurantId: string) => void;
}

export function useSetupReadinessData(
  initialBranchId: string | null,
): SetupReadinessDataController {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [newBranchRestaurantId, setNewBranchRestaurantId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState(
    initialBranchId ?? "",
  );
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantStatus, setRestaurantStatus] =
    useState<Restaurant["status"]>("active");
  const [branchDraft, setBranchDraft] = useState<BranchDraft>(emptyBranchDraft);
  const [newBranchDraft, setNewBranchDraft] =
    useState<BranchDraft>(emptyBranchDraft);
  const [serviceReason, setServiceReason] = useState("");
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const reloadGuard = useRef(createSetupReloadGuard());

  async function reload(
    preferredBranchId: string | null,
    preferredRestaurantId: string | null = null,
  ): Promise<void> {
    const controller = reloadGuard.current.begin();
    setLoadState({ kind: "loading" });
    try {
      const [restaurantsResult, branchesResult] = await Promise.all([
        setupApi(
          "/api/v1/staff/restaurants",
          z.object({ items: z.array(restaurantSchema) }),
          { signal: controller.signal },
        ),
        setupApi(
          "/api/v1/staff/branches",
          z.object({ items: z.array(branchSchema) }),
          { signal: controller.signal },
        ),
      ]);
      const restaurants = restaurantsResult.items;
      const branches = branchesResult.items;
      const selectedBranch =
        branches.find((branch) => branch.id === preferredBranchId) ??
        (preferredRestaurantId
          ? branches.find(
              (branch) => branch.restaurantId === preferredRestaurantId,
            )
          : branches[0]);
      const selectedRestaurant =
        restaurants.find(
          (restaurant) => restaurant.id === selectedBranch?.restaurantId,
        ) ??
        restaurants.find(
          (restaurant) => restaurant.id === preferredRestaurantId,
        ) ??
        restaurants[0];
      const employeeResults = await Promise.all(
        restaurants.map((restaurant) =>
          optionalSetupApi(
            `/api/v1/staff/employees?restaurantId=${restaurant.id}`,
            z.object({ items: z.array(employeeSchema) }),
            { signal: controller.signal },
          ),
        ),
      );
      const employees = employeeResults.flatMap(
        (result) => result?.items ?? [],
      );
      const employeeVisibleRestaurantIds = restaurants.flatMap(
        (restaurant, index) =>
          employeeResults[index] !== null ? [restaurant.id] : [],
      );
      const branchContext = selectedBranch;
      const restaurantId =
        branchContext?.restaurantId ?? selectedRestaurant?.id;
      const branchSetup: readonly [
        FeatureResult | null,
        FeatureResult | null,
        { readonly items: readonly Category[] } | null,
        { readonly items: readonly Dish[] } | null,
        { readonly items: readonly TableRecord[] } | null,
        { readonly items: readonly QrCodeRecord[] } | null,
      ] =
        branchContext && restaurantId
          ? await Promise.all([
              optionalSetupApi(
                `/api/v1/staff/branches/${branchContext.id}/features`,
                featureResultSchema,
                { signal: controller.signal },
              ),
              optionalSetupApi(
                `/api/v1/staff/restaurants/${restaurantId}/features`,
                featureResultSchema,
                { signal: controller.signal },
              ),
              optionalSetupApi(
                `/api/v1/staff/restaurants/${restaurantId}/menu/categories`,
                z.object({ items: z.array(categorySchema) }),
                { signal: controller.signal },
              ),
              optionalSetupApi(
                `/api/v1/staff/restaurants/${restaurantId}/menu/dishes`,
                z.object({ items: z.array(dishSchema) }),
                { signal: controller.signal },
              ),
              optionalSetupApi(
                `/api/v1/staff/branches/${branchContext.id}/tables`,
                z.object({ items: z.array(tableSchema) }),
                { signal: controller.signal },
              ),
              optionalSetupApi(
                `/api/v1/staff/branches/${branchContext.id}/qr-codes`,
                z.object({ items: z.array(qrSchema) }),
                { signal: controller.signal },
              ),
            ])
          : [null, null, null, null, null, null];
      const [
        features,
        restaurantFeatures,
        categories,
        dishes,
        tables,
        qrCodes,
      ] = branchSetup;
      const data: SetupData = {
        restaurants,
        branches,
        employees,
        employeeVisibleRestaurantIds,
        categories: categories?.items ?? [],
        dishes: dishes?.items ?? [],
        tables: tables?.items ?? [],
        qrCodes: qrCodes?.items ?? [],
        features,
        restaurantFeatures,
      };
      if (!reloadGuard.current.isCurrent(controller)) {
        return;
      }
      setSelectedBranchId(selectedBranch?.id ?? "");
      setSelectedRestaurantId(selectedRestaurant?.id ?? "");
      setNewBranchRestaurantId(selectedRestaurant?.id ?? "");
      setRestaurantName(selectedRestaurant?.name ?? "");
      setRestaurantStatus(selectedRestaurant?.status ?? "active");
      setBranchDraft(
        selectedBranch ? draftFromBranch(selectedBranch) : emptyBranchDraft(),
      );
      setLoadState({ kind: "ready", data });
    } catch (error) {
      if (!reloadGuard.current.isCurrent(controller)) {
        return;
      }
      setLoadState({
        kind: "error",
        message: describeError(error),
      });
    } finally {
      reloadGuard.current.finish(controller);
    }
  }

  function selectRestaurant(restaurantId: string): void {
    if (loadState.kind !== "ready") return;
    const branch = loadState.data.branches.find(
      (item) => item.restaurantId === restaurantId,
    );
    void reload(branch?.id ?? null, restaurantId);
  }

  useEffect(() => {
    void reload(initialBranchId);
    return () => reloadGuard.current.cancel();
  }, [initialBranchId]);

  return {
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
    setSelectedBranchId,
    setRestaurantName,
    setRestaurantStatus,
    setBranchDraft,
    setNewBranchDraft,
    setServiceReason,
    setMessage,
    setPendingAction,
    reload,
    selectRestaurant,
  };
}

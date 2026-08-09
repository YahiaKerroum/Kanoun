import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import {
  describeError,
  formText,
  restaurantSchema,
  setupApi,
} from "./setup-readiness-model.js";
import type { SetupData } from "./setup-readiness-model.js";

interface SetupRestaurantActionsInput {
  readonly data: SetupData;
  readonly selectedRestaurantId: string;
  readonly selectedBranchId: string;
  readonly setMessage: Dispatch<SetStateAction<string>>;
  readonly setPendingAction: Dispatch<SetStateAction<string>>;
  readonly reload: (
    preferredBranchId: string | null,
    preferredRestaurantId?: string | null,
  ) => Promise<void>;
}

export interface SetupRestaurantActions {
  readonly createRestaurant: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
  readonly saveRestaurant: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
}

export function createSetupRestaurantActions({
  data,
  selectedRestaurantId,
  selectedBranchId,
  setMessage,
  setPendingAction,
  reload,
}: SetupRestaurantActionsInput): SetupRestaurantActions {
  async function createRestaurant(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), "restaurantName");
    if (!name) {
      setMessage("Enter a restaurant name before creating it.");
      return;
    }
    setPendingAction("Creating restaurant");
    try {
      const restaurant = await setupApi(
        "/api/v1/staff/restaurants",
        restaurantSchema,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );
      await reload(null, restaurant.id);
      setMessage(
        "Restaurant created. Its independent configuration is ready for setup.",
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setPendingAction("");
    }
  }

  async function saveRestaurant(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const restaurant = data.restaurants.find(
      (item) => item.id === selectedRestaurantId,
    );
    if (!restaurant) {
      setMessage("Select a restaurant before saving.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const name = formText(formData, "selectedRestaurantName");
    const status = formText(formData, "selectedRestaurantStatus");
    if (!name) {
      setMessage("Restaurant name is required.");
      return;
    }
    if (
      status === "inactive" &&
      restaurant.status === "active" &&
      !window.confirm(
        "Deactivate this restaurant? History is preserved, but new work will be blocked.",
      )
    ) {
      return;
    }
    setPendingAction("Saving restaurant");
    try {
      await setupApi(
        `/api/v1/staff/restaurants/${restaurant.id}`,
        restaurantSchema,
        {
          method: "PATCH",
          headers: { "if-match": `"${restaurant.version}"` },
          body: JSON.stringify({ name, status }),
        },
      );
      await reload(selectedBranchId || null, selectedRestaurantId || null);
      setMessage(
        status === "inactive"
          ? "Restaurant deactivated; history remains available."
          : "Restaurant saved.",
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setPendingAction("");
    }
  }

  return { createRestaurant, saveRestaurant };
}

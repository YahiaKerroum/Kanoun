import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import { restaurantStatusFrom } from "./setup-readiness-model.js";
import type { Restaurant, SetupData } from "./setup-readiness-model.js";

export interface SetupRestaurantSectionProps {
  readonly data: SetupData;
  readonly selectedRestaurantId: string;
  readonly restaurantName: string;
  readonly restaurantStatus: Restaurant["status"];
  readonly pendingAction: string;
  readonly canEditRestaurants: boolean;
  readonly onSelectRestaurant: (restaurantId: string) => void;
  readonly setRestaurantName: Dispatch<SetStateAction<string>>;
  readonly setRestaurantStatus: Dispatch<SetStateAction<Restaurant["status"]>>;
  readonly createRestaurant: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
  readonly saveRestaurant: (
    event: SyntheticEvent<HTMLFormElement>,
  ) => Promise<void>;
}

export function SetupRestaurantSection({
  data,
  selectedRestaurantId,
  restaurantName,
  restaurantStatus,
  pendingAction,
  canEditRestaurants,
  onSelectRestaurant,
  setRestaurantName,
  setRestaurantStatus,
  createRestaurant,
  saveRestaurant,
}: SetupRestaurantSectionProps) {
  return (
    <section
      className="admin-section"
      id="restaurant-editor"
      aria-labelledby="restaurant-setup-title"
    >
      <div className="section-heading">
        <div>
          <h3 id="restaurant-setup-title">Restaurants</h3>
        </div>
        <span>
          {data.restaurants.length} restaurant
          {data.restaurants.length === 1 ? "" : "s"}
        </span>
      </div>
      {canEditRestaurants ? (
        <form
          className="inline-form setup-form-grid"
          onSubmit={(event) => void createRestaurant(event)}
        >
          <label>
            New restaurant name
            <input name="restaurantName" maxLength={160} required />
          </label>
          <button type="submit" disabled={pendingAction.length > 0}>
            Create restaurant
          </button>
          <p>
            Each restaurant has its own branches, menu, settings, and team.
            Deactivating one keeps its history.
          </p>
        </form>
      ) : (
        <p className="setup-form-note">
          Your account can view restaurants but not change them.
        </p>
      )}
      <div className="record-selector" aria-label="Restaurants">
        {data.restaurants.map((restaurant) => (
          <button
            key={restaurant.id}
            className={
              restaurant.id === selectedRestaurantId ? "is-selected" : ""
            }
            type="button"
            onClick={() => onSelectRestaurant(restaurant.id)}
          >
            <span>
              <strong>{restaurant.name}</strong>
              <small>Version {restaurant.version}</small>
            </span>
            <span>{restaurant.status}</span>
          </button>
        ))}
      </div>
      {selectedRestaurantId && canEditRestaurants ? (
        <form
          className="selected-record record-editor setup-form-grid"
          onSubmit={(event) => void saveRestaurant(event)}
        >
          <label>
            Restaurant name
            <input
              name="selectedRestaurantName"
              value={restaurantName}
              onChange={(event) => setRestaurantName(event.target.value)}
              required
            />
          </label>
          <label>
            Lifecycle status
            <select
              name="selectedRestaurantStatus"
              value={restaurantStatus}
              onChange={(event) =>
                setRestaurantStatus(restaurantStatusFrom(event.target.value))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button type="submit" disabled={pendingAction.length > 0}>
            Save restaurant
          </button>
          <p className="setup-form-note">
            If someone else saved first, reload before saving. Every change is
            recorded in the audit history.
          </p>
        </form>
      ) : null}
    </section>
  );
}

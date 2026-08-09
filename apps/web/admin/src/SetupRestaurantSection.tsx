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
          <p className="eyebrow">Independent tenant records</p>
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
            Restaurants keep independent branches, menus, settings, and
            workforce scope. Deactivation preserves history.
          </p>
        </form>
      ) : (
        <p className="setup-form-note">
          Restaurant records are read-only for this permission scope.
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
            Optimistic version checks protect concurrent edits. Changes are
            recorded in audit history.
          </p>
        </form>
      ) : null}
    </section>
  );
}

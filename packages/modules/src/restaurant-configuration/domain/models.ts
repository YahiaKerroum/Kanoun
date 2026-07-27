export interface Address {
  readonly line1: string;
  readonly line2?: string | undefined;
  readonly city: string;
  readonly region?: string | undefined;
  readonly postalCode?: string | undefined;
  readonly countryCode: string;
}

export interface ContactInformation {
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
}

export interface OpeningPeriod {
  readonly dayOfWeek: number;
  readonly opensAt: string;
  readonly closesAt: string;
}

export interface RestaurantRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly name: string;
  readonly status: "active" | "inactive";
  readonly branding: Readonly<Record<string, unknown>>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly version: number;
}

export interface BranchRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly name: string;
  readonly address: Address;
  readonly contact: ContactInformation;
  readonly timeZone: string;
  readonly currency: string;
  readonly status: "active" | "inactive";
  readonly serviceStatus: "open" | "closed" | "temporarily_unavailable";
  readonly allowOrderOverride: boolean;
  readonly version: number;
  readonly openingHours: readonly OpeningPeriod[];
}

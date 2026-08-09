export const DEMO_ROLE_DEFINITIONS = [
  {
    key: "owner",
    label: "Owner / administrator",
    displayName: "Nadia Cheriet",
    email: "nadia.cheriet@dar-nedjma.demo",
    target: "administration",
    templateKey: "administrator",
  },
  {
    key: "general-staff",
    label: "General staff",
    displayName: "Imane Khellaf",
    email: "imane.khellaf@dar-nedjma.demo",
    target: "staff",
    templateKey: "general_staff",
  },
  {
    key: "kitchen",
    label: "Kitchen staff",
    displayName: "Yacine Bensaid",
    email: "yacine.bensaid@dar-nedjma.demo",
    target: "staff",
    templateKey: "kitchen_staff",
  },
  {
    key: "cashier",
    label: "Cashier",
    displayName: "Samira Bouzid",
    email: "samira.bouzid@dar-nedjma.demo",
    target: "staff",
    templateKey: "cashier",
  },
] as const;

export type DemoRoleKey = (typeof DEMO_ROLE_DEFINITIONS)[number]["key"];

export interface DemoRoleCredential {
  readonly key: DemoRoleKey;
  readonly label: string;
  readonly displayName: string;
  readonly email: string;
  readonly target: "administration" | "staff";
  readonly password: string;
}

export interface DemoCustomerUrl {
  readonly tableCode: string;
  readonly url: string;
}

export interface DemoSeedResult {
  readonly businessCode: string;
  readonly businessName: string;
  readonly restaurantName: string;
  readonly branchName: string;
  readonly roles: readonly DemoRoleCredential[];
  readonly customerUrls: readonly DemoCustomerUrl[];
  readonly scenario: readonly string[];
}

export const DEMO_SCENARIO = [
  "Guest scans the T-12 table QR and submits a menu order.",
  "General staff follows the order and table handoff.",
  "Kitchen starts and readies the order before service.",
  "General staff marks the ready order served.",
  "Cashier records the full cash or card payment and completes the order.",
] as const;

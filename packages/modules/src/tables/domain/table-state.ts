import type { DerivedTableState, EntityStatus } from "./models.js";

/**
 * Precedence from docs/domain/workflows.yaml `derived_table_state`:
 * inactive > out_of_service > occupied > available.
 */
export function deriveTableState(input: {
  readonly status: EntityStatus;
  readonly outOfService: boolean;
  readonly hasOpenSession: boolean;
}): DerivedTableState {
  if (input.status === "inactive") {
    return "inactive";
  }
  if (input.outOfService) {
    return "out_of_service";
  }
  if (input.hasOpenSession) {
    return "occupied";
  }
  return "available";
}

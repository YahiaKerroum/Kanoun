import type { BranchDraft } from "./setup-readiness-model.js";

export function addressFromDraft(draft: BranchDraft) {
  return {
    line1: draft.line1,
    ...(draft.line2 ? { line2: draft.line2 } : {}),
    city: draft.city,
    ...(draft.region ? { region: draft.region } : {}),
    ...(draft.postalCode ? { postalCode: draft.postalCode } : {}),
    countryCode: draft.countryCode,
  };
}

export function contactFromDraft(draft: BranchDraft) {
  return {
    ...(draft.email ? { email: draft.email } : {}),
    ...(draft.phone ? { phone: draft.phone } : {}),
  };
}

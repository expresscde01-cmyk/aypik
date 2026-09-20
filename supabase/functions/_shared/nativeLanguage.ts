export function hasNativeSpokenLanguagePayload(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { level?: unknown }).level === "native"
  );
}

export function checkoutPlanRequiresNative(plan: string): boolean {
  return plan === "international" || plan === "premium";
}

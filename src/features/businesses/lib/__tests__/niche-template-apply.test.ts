import { describe, expect, it } from "vitest";
import { shouldConfirmNicheSwitch } from "@/features/businesses/lib/niche-template-apply";

describe("shouldConfirmNicheSwitch", () => {
  it("does not confirm when no template has ever been applied and the form is clean", () => {
    expect(shouldConfirmNicheSwitch(false, false)).toBe(false);
  });

  it("does not confirm the very first template application, even if the form has edits", () => {
    // Nothing templated has been overwritten yet — there is nothing to lose,
    // so the first-ever apply stays silent per design's "Giro switch after
    // manual edits" decision.
    expect(shouldConfirmNicheSwitch(false, true)).toBe(false);
  });

  it("does not confirm a later switch when nothing has been edited since the last apply", () => {
    expect(shouldConfirmNicheSwitch(true, false)).toBe(false);
  });

  it("confirms a later switch when the operator edited a templated field since the last apply", () => {
    expect(shouldConfirmNicheSwitch(true, true)).toBe(true);
  });
});

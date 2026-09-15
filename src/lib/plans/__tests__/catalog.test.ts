import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, PLAN_CODES } from "@/lib/plans/catalog";

/**
 * Content-drift guard: these numbers are copied from
 * `docs/negocio/precios/tarifario.md` (the commercial source of truth), not
 * derived from the code under test. If someone edits `PLAN_CATALOG` without
 * updating the tariff (or vice versa), this test fails instead of silently
 * drifting — see plans-and-quotas tasks 1.3/1.4.
 */
describe("PLAN_CATALOG", () => {
  it("lists exactly the four tariff plan codes", () => {
    expect(PLAN_CODES).toEqual(["starter", "basic", "pro", "premium"]);
  });

  it("matches tarifario.md for starter", () => {
    expect(PLAN_CATALOG.starter).toEqual({
      chatAllowance: 150,
      replyAllowance: 900,
      priceSolesIncTax: 149,
    });
  });

  it("matches tarifario.md for basic", () => {
    expect(PLAN_CATALOG.basic).toEqual({
      chatAllowance: 300,
      replyAllowance: 1800,
      priceSolesIncTax: 379,
    });
  });

  it("matches tarifario.md for pro", () => {
    expect(PLAN_CATALOG.pro).toEqual({
      chatAllowance: 500,
      replyAllowance: 3000,
      priceSolesIncTax: 749,
    });
  });

  it("matches tarifario.md for premium", () => {
    expect(PLAN_CATALOG.premium).toEqual({
      chatAllowance: 1500,
      replyAllowance: 9000,
      priceSolesIncTax: 2499,
    });
  });
});

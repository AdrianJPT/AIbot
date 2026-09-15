import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOwnershipFixtures,
  createTestBusiness,
  createTestConversation,
  createTestUser,
} from "@/lib/__tests__/fixtures/ownership";
import { requireSameTenant, type ToolPipelineContext } from "../tenant-guard";

const ownerIds: string[] = [];

afterEach(async () => {
  await cleanupOwnershipFixtures(ownerIds.splice(0));
});

async function setupTenant(prefix: string) {
  const owner = await createTestUser(prefix);
  ownerIds.push(owner.id);
  const business = await createTestBusiness(owner.id, prefix);
  const conversation = await createTestConversation(business.id, prefix);
  return { owner, business, conversation };
}

describe("requireSameTenant", () => {
  it("allows an entity whose businessId matches the pipeline context's business", async () => {
    const { business, conversation } = await setupTenant("tg-same");
    const context: ToolPipelineContext = { business, conversation };

    const result = requireSameTenant(context, business.id);

    expect(result).toEqual({ ok: true });
  });

  it("refuses an entity that belongs to a different tenant's business", async () => {
    const { business, conversation } = await setupTenant("tg-a");
    const { business: otherBusiness } = await setupTenant("tg-b");
    const context: ToolPipelineContext = { business, conversation };

    const result = requireSameTenant(context, otherBusiness.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("tenant_mismatch");
      expect(result.failure.message).toContain(business.id);
    }
  });

  it("fails closed when the referenced entity has no resolvable businessId (missing/ambiguous)", async () => {
    const { business, conversation } = await setupTenant("tg-missing");
    const context: ToolPipelineContext = { business, conversation };

    const missing = requireSameTenant(context, null);
    const ambiguous = requireSameTenant(context, undefined);

    expect(missing.ok).toBe(false);
    expect(ambiguous.ok).toBe(false);
    if (!missing.ok) expect(missing.failure.code).toBe("tenant_mismatch");
    if (!ambiguous.ok) expect(ambiguous.failure.code).toBe("tenant_mismatch");
  });

  it("refuses an empty-string businessId rather than treating it as a wildcard match", async () => {
    const { business, conversation } = await setupTenant("tg-empty");
    const context: ToolPipelineContext = { business, conversation };

    const result = requireSameTenant(context, "");

    expect(result.ok).toBe(false);
  });
});

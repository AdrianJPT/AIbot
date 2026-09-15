import { describe, expect, it } from "vitest";
import type { AppConfig } from "@prisma/client";
import { buildBusiness } from "@/lib/__tests__/fixtures/business";
import { toolsEffectivelyEnabled } from "../enabled";

function buildAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    id: "default",
    whatsappCredentialId: null,
    chatModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    audioModel: "whisper-1",
    toolsEnabled: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("toolsEffectivelyEnabled", () => {
  it("is false when both the platform switch and the business opt-in are off", () => {
    const appConfig = buildAppConfig({ toolsEnabled: false });
    const business = buildBusiness({ toolsEnabled: false });

    expect(toolsEffectivelyEnabled(appConfig, business)).toBe(false);
  });

  it("is false when the platform switch is on but the business has not opted in", () => {
    const appConfig = buildAppConfig({ toolsEnabled: true });
    const business = buildBusiness({ toolsEnabled: false });

    expect(toolsEffectivelyEnabled(appConfig, business)).toBe(false);
  });

  it("is false when the business opted in but the platform switch is off — platform off overrides business on", () => {
    const appConfig = buildAppConfig({ toolsEnabled: false });
    const business = buildBusiness({ toolsEnabled: true });

    expect(toolsEffectivelyEnabled(appConfig, business)).toBe(false);
  });

  it("is true when both the platform switch and the business opt-in are on", () => {
    const appConfig = buildAppConfig({ toolsEnabled: true });
    const business = buildBusiness({ toolsEnabled: true });

    expect(toolsEffectivelyEnabled(appConfig, business)).toBe(true);
  });

  it("is false when there is no AppConfig row at all, even if the business opted in", () => {
    const business = buildBusiness({ toolsEnabled: true });

    expect(toolsEffectivelyEnabled(null, business)).toBe(false);
  });
});

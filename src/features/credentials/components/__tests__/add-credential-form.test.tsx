import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddCredentialForm } from "../add-credential-form";

function renderForm(provider: string) {
  return renderToStaticMarkup(
    <AddCredentialForm
      kind="ai"
      provider={provider}
      label=""
      apiKey=""
      baseUrl=""
      saving={false}
      onKindChange={() => {}}
      onProviderChange={() => {}}
      onLabelChange={() => {}}
      onKeyChange={() => {}}
      onBaseUrlChange={() => {}}
      onSubmit={() => {}}
    />,
  );
}

describe("AddCredentialForm provider dropdown", () => {
  it("lists OpenCode Zen as a selectable option with value opencode-zen", () => {
    const html = renderForm("openai");

    expect(html).toMatch(/<option[^>]*value="opencode-zen"[^>]*>OpenCode Zen<\/option>/);
  });

  it("does not reveal the Base URL field when opencode-zen is selected", () => {
    const html = renderForm("opencode-zen");

    expect(html).not.toContain('id="cred-baseurl"');
  });
});

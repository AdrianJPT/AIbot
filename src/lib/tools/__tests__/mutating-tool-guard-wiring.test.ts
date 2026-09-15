/**
 * Structural enforcement for the tenant boundary: a rule enforced only by
 * code review will eventually be forgotten, so this reads the tool kernel's
 * own source (same approach as `src/lib/analytics/__tests__/repository.test.ts`'s
 * "every $queryRaw uses the tagged-template form" test) and fails the build
 * if any tool file declares `mutating: true` without also calling
 * `requireSameTenant(` — the tenant guard from `../tenant-guard.ts` — in
 * that same file.
 *
 * `__tests__` is excluded from the scan: test files construct throwaway
 * `ToolDefinition` fixtures (e.g. `registry.test.ts`'s `buildTool`) that are
 * never registered against real tenant data, so requiring them to wire the
 * guard would be a false positive, not a real gap.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TOOLS_DIR = path.join(__dirname, "..");

function collectToolSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectToolSourceFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Strips `/* ... *\/` block comments (JSDoc included) and `// ...` line
 * comments before pattern-matching. Without this, a docstring that mentions
 * `mutating: true` or `requireSameTenant(` as prose — exactly what this
 * module's own comments do, to document the rule — would be indistinguishable
 * from the real declaration/call the check exists to find.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("mutating tool tenant-guard wiring", () => {
  it("requires every tool source file declaring `mutating: true` to also call requireSameTenant(", () => {
    const offenders = collectToolSourceFiles(TOOLS_DIR)
      .filter((file) => {
        const code = stripComments(readFileSync(file, "utf-8"));
        return (
          /mutating:\s*true/.test(code) && !/requireSameTenant\(/.test(code)
        );
      })
      .map((file) => path.relative(TOOLS_DIR, file));

    expect(offenders).toEqual([]);
  });
});

import type { NicheId } from "@/lib/niche-templates";
import { NICHE_TEMPLATE_LIST } from "@/lib/niche-templates";

/**
 * Presentational-only giro picker for the create-business form. Reuses the
 * exact native `<select>` Tailwind classes already used 3x in
 * `business-form.tsx` (`aiCredentialId`/`whatsappCredentialId`/`ownerId`) —
 * see design's "Picker control" decision for why a native `<select>` instead
 * of `@/components/ui/select.tsx` (Radix/portal-based, zero consumers, does
 * not serialize under `renderToStaticMarkup`).
 *
 * Purely presentational: this component owns no state and calls no
 * `confirm()` — the container decides whether switching giros needs a
 * confirmation gate (see `shouldConfirmNicheSwitch`) and passes the
 * resulting `value`/`onChange` down.
 */
export function NicheTemplatePicker({
  value,
  onChange,
}: {
  value: NicheId | "";
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="nicheId" className="text-sm font-medium leading-none">
        Giro (opcional)
      </label>
      <select
        id="nicheId"
        name="nicheId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="">Sin giro (completar todo manualmente)</option>
        {NICHE_TEMPLATE_LIST.map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
      </select>
    </div>
  );
}

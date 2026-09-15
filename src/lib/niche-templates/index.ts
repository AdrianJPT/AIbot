import barberia from "@/lib/niche-templates/barberia";
import cafeteria from "@/lib/niche-templates/cafeteria";
import dentista from "@/lib/niche-templates/dentista";
import panaderia from "@/lib/niche-templates/panaderia";
import restaurante from "@/lib/niche-templates/restaurante";
import salonDeBelleza from "@/lib/niche-templates/salon-de-belleza";
import spa from "@/lib/niche-templates/spa";
import type { NicheTemplate } from "@/lib/niche-templates/types";

export type { NicheId, NicheTemplate } from "@/lib/niche-templates/types";

/**
 * Every shipped giro template, in picker display order. Each niche is its own
 * file — see design's "Registry layout" decision — so adding a giro is adding
 * a file plus one entry here, never a growing shared object.
 */
export const NICHE_TEMPLATE_LIST: NicheTemplate[] = [
  restaurante,
  cafeteria,
  panaderia,
  barberia,
  salonDeBelleza,
  spa,
  dentista,
];

/**
 * Resolves a giro id to its template. Returns `undefined` for an unknown or
 * empty id instead of throwing — a stale/unmatched id degrades to "no
 * prefill", leaving the create form's existing blank-state behavior
 * untouched (see design's "Unknown/empty id" decision and the spec's "No
 * prefill without a matching giro" scenario).
 */
export function resolveNicheTemplate(id: string): NicheTemplate | undefined {
  return NICHE_TEMPLATE_LIST.find((template) => template.id === id);
}

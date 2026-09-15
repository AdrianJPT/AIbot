/**
 * The 14 supported business "giros" (niches). Adding a giro means adding a
 * file that exports a `NicheTemplate` for one of these ids, plus one
 * registration line in `index.ts` — no other file changes shape.
 */
export type NicheId =
  | "restaurante"
  | "cafeteria"
  | "panaderia"
  | "barberia"
  | "salon-de-belleza"
  | "spa"
  | "dentista"
  | "clinica"
  | "gimnasio"
  | "coach"
  | "inmobiliaria"
  | "tienda"
  | "veterinaria"
  | "taller-mecanico";

/**
 * A platform-authored template for one giro. Selecting it in the create-business
 * picker copies these values once into the new business's own columns — see
 * `shouldConfirmNicheSwitch` and `resolveNicheTemplate` for how the copy is
 * gated and resolved. The fields map 1:1 onto `CreateBusinessInput` (see
 * `src/lib/businesses/create.ts`), so template content flows through the exact
 * same trust boundary as manually typed content.
 */
export interface NicheTemplate {
  /** Matches `NicheId`; also the `<option value>` in the picker. */
  id: NicheId;
  /** Human-readable `<option>` text, e.g. "Restaurante". */
  label: string;
  /** -> `Business.systemPrompt`. Interpolated by `buildSystemPrompt`'s
   * `{businessName}`/`{businessInfo}` placeholders — never rendered directly. */
  systemPromptTemplate: string;
  /** -> `Business.welcomeMessage`. Interpolated by `{businessName}`. */
  welcomeMessageTemplate: string;
  /** -> `Business.businessInfo`. A flat string map, matching the create form's
   * own `JSON.parse`/`JSON.stringify` round-trip of that column. */
  businessInfoTemplate: Record<string, string>;
  /** -> `Business.knowledgeDoc`. Must stay under `MAX_KNOWLEDGE_DOC_CHARS`
   * (see `src/lib/businesses/create.ts`) so `normalizeKnowledgeDoc` never
   * truncates it. `null` when the niche has no knowledge doc content. */
  knowledgeDocTemplate: string | null;
  /** -> `Business.replyWindowMs`. Optional: omitted niches fall back to the
   * form's existing default. */
  defaultReplyWindowMs?: number;
}

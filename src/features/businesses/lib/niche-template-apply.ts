/**
 * Whether picking a different giro should confirm before overwriting the
 * templated fields.
 *
 * The first-ever application of a template is always silent: nothing
 * templated has been written yet, so there is nothing for the operator to
 * lose. Only a *later* switch — one that happens after a template has
 * already been applied at least once — risks discarding either the
 * previous template's values or the operator's own edits, so that case
 * gates on an explicit confirm. See design's "Giro switch after manual
 * edits" decision table.
 *
 * Extracted as a pure function (no DOM, no `confirm()` call inside it) so
 * the branch is unit-testable in a repo with no jsdom/testing-library —
 * see design's "Dirty-gate testability" decision. The container only calls
 * this plus the actual `window.confirm(...)`.
 */
export function shouldConfirmNicheSwitch(
  hasAppliedBefore: boolean,
  dirtySinceTemplate: boolean,
): boolean {
  return hasAppliedBefore && dirtySinceTemplate;
}

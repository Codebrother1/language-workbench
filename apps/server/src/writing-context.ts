import {
  matchesLibraryScope,
  relevantLibraryItems,
  resolveWritingStyle,
  sectionText,
  type AIRequest,
  type PersonalLibrary,
} from "@workbench/domain";
import type { Repository } from "./repository.js";

/** Derived read-only context; duplicate labels/kinds never determine adjacency. */
export function relationalContext(request: AIRequest) {
  const sections = request.readContext.document.sections;
  const index = sections.findIndex(
    (s) => s.id === request.editTarget.sectionId,
  );
  const describe = (position: number) => {
    const section = sections[position];
    return section
      ? {
          sectionId: section.id,
          index: position,
          kind: section.kind,
          role: section.kind,
          label: section.label,
          notes: section.notes,
          text: sectionText(section),
        }
      : null;
  };
  return index < 0
    ? { previous: null, current: null, next: null }
    : {
        previous: describe(index - 1),
        current: describe(index),
        next: describe(index + 1),
      };
}

/** The sole server enrichment path, shared by the registry, comparisons and legacy injection.
 * Scope lists are OR within a dimension, AND across dimensions; audiences are exact labels
 * (case-insensitive), never substring matches. Stored references are not insertion commands.
 * No provider result is written back to the library, including use counts or observations.
 */
export function enrichWritingRequest(
  input: AIRequest,
  repository: Pick<Repository, "getLibrary">,
): AIRequest {
  const stored = repository.getLibrary();
  const section = input.readContext.document.sections.find(
    (s) => s.id === input.editTarget.sectionId,
  );
  const context = {
    sectionKind: section?.kind,
    contentType: input.readContext.document.brief.contentType,
    audience: input.readContext.document.brief.audience,
    register:
      input.structure?.draft.register ?? input.readContext.styleDNA.register,
  };
  // Bound external disclosure, including rules/avoid records, to fifty matching items total.
  // Priority rules/avoid items first; then mechanically ranked references. Stable IDs break ties.
  const applicable = stored.items.filter((item) =>
    matchesLibraryScope(item, context),
  );
  const rules = applicable
    .filter((item) => item.kind === "style_rule" || item.preference === "avoid")
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 40);
  const references = relevantLibraryItems(
    applicable,
    context,
    50 - rules.length,
  );
  const library: PersonalLibrary = {
    ...stored,
    items: [
      ...new Map(
        [...rules, ...references].map((item) => [item.id, item]),
      ).values(),
    ].sort((a, b) => a.id.localeCompare(b.id)),
  };
  const resolvedStyle = resolveWritingStyle({
    global: input.readContext.styleDNA,
    library,
    context,
    sectionNotes: section?.notes,
    instruction: input.instruction,
  });
  return {
    ...input,
    readContext: {
      ...input.readContext,
      personalLibrary: library,
      resolvedStyle,
    },
  };
}

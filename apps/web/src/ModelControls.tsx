import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import {
  type ModelRef,
  type ProviderCatalog,
  modelKey,
  parseModelKey,
  routingPreferencesSchema,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { Button, Field, Select } from "./ui";
export function modelLabel(
  catalog: ProviderCatalog | null,
  ref: ModelRef | null | undefined,
) {
  if (!ref) return "Inherit";
  const p = catalog?.providers.find((p) => p.id === ref.providerId);
  const model = p?.models.find((m) => m.id === ref.modelId);
  return (
    (model?.displayName ?? ref.modelId) +
    " · " +
    (p?.displayName ?? ref.providerId) +
    (p?.id === "openai" &&
    (!p.configured ||
      !p.enabled ||
      (p.lastRefreshedAt && (!model || model.availability !== "available")))
      ? " · Unavailable"
      : "")
  );
}
/** Shared searchable picker; no routing policy or credentials live in this component. */
export function ModelPicker({
  catalog,
  value,
  onChange,
  label,
  inherit = "Inherit",
}: {
  catalog: ProviderCatalog | null;
  value: ModelRef | null | undefined;
  onChange: (ref: ModelRef | null) => void;
  label: string;
  inherit?: string;
}) {
  const [query, setQuery] = useState("");
  const models = (catalog?.providers ?? []).flatMap((p) =>
    p.models.map((m) => ({
      ref: { providerId: p.id, modelId: m.id },
      name: m.displayName + " · " + p.displayName,
      ready:
        p.configured &&
        p.enabled &&
        p.implemented &&
        m.availability !== "unavailable",
      group:
        p.id !== "openai"
          ? p.displayName
          : m.availability === "unavailable"
            ? "Unavailable selections"
            : m.metadata?.group === "known"
              ? "OpenAI Direct · known"
              : m.availability === "unverified"
                ? "OpenAI Direct · unverified IDs"
                : "Other compatible OpenAI models",
    })),
  );
  const choices = models.filter(
    (m) =>
      (m.ready && m.name.toLowerCase().includes(query.toLowerCase())) ||
      (value && modelKey(value) === modelKey(m.ref)),
  );
  const groups = [...new Set(choices.map((m) => m.group))];
  return (
    <div className="model-picker">
      <Field label={"Search " + label.toLowerCase()}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a model…"
        />
      </Field>
      <Field label={label}>
        <Select
          value={value ? modelKey(value) : ""}
          onChange={(e) => onChange(parseModelKey(e.target.value))}
        >
          <option value="">{inherit}</option>
          {value &&
            !models.some((m) => modelKey(m.ref) === modelKey(value)) && (
              <option value={modelKey(value)}>
                {modelLabel(catalog, value)}
                {catalog?.providers.find((p) => p.id === value.providerId)
                  ?.lastRefreshedAt
                  ? ""
                  : " (not listed)"}
              </option>
            )}
          {groups.map((group) => (
            <optgroup label={group} key={group}>
              {choices
                .filter((m) => m.group === group)
                .map((m) => (
                  <option
                    disabled={!m.ready}
                    key={modelKey(m.ref)}
                    value={modelKey(m.ref)}
                  >
                    {m.name}
                    {m.ready ? "" : " (Unavailable)"}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
    </div>
  );
}
export function ModelControls({ w }: { w: Workspace }) {
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  const whole = w.responseTarget?.scope === "document";
  const activeModels = w.running?.models
    .map((model) => modelLabel(w.catalog, model))
    .join(" + ");
  const available = (w.catalog?.providers ?? [])
    .filter((p) => p.implemented && p.configured && p.enabled)
    .flatMap((p) =>
      p.models
        .filter((m) => m.availability !== "unavailable")
        .map((m) => ({ providerId: p.id, modelId: m.id })),
    );
  return (
    <details className="model-controls">
      <summary aria-label="Model controls">
        <span>
          {activeModels
            ? `Running with: ${activeModels}`
            : w.catalog
              ? `Next run with: ${modelLabel(w.catalog, w.effectiveModel.model)}`
              : "Provider status unavailable"}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="model-controls-body">
        {activeModels && (
          <p className="small" data-testid="active-route">
            Running with: {activeModels}
          </p>
        )}
        <p className="small muted">
          Model source: {w.effectiveModel.source.replace("_", " ")}. Changing a
          model never changes your text.
        </p>
        {section && !whole && (
          <>
            <p className="small muted" data-testid="section-default">
              Section default:{" "}
              {section.modelOverride
                ? modelLabel(w.catalog, section.modelOverride)
                : "Use current routing"}
            </p>
            <ModelPicker
              catalog={w.catalog}
              value={section.modelOverride}
              onChange={w.setSectionModel}
              label="Section model"
              inherit="Use default model"
            />
            <div className="row wrap">
              <Button onClick={() => w.setSectionModel(null)}>
                Use inherited default
              </Button>
              <Button
                onClick={() => w.setSectionTypeModel(w.effectiveModel.model)}
              >
                Set default for {section.kind}
              </Button>
            </div>
          </>
        )}
        <ModelPicker
          catalog={w.catalog}
          value={w.oneOffModel ?? w.chainModel}
          onChange={w.setOneOffModel}
          label="Run with"
          inherit="Use default model"
        />
        <p className="small muted">
          Run with stays with this target’s Diagnose → Propose chain. New
          diagnosis starts a new route; Compare must include the pinned model.
        </p>
        <details>
          <summary>Compare models</summary>
          <p className="small">
            Same target, material, and context. Each result stays separate.
            Creative comparisons use your answer below.
          </p>
          <div className="compare-choices">
            {available.map((ref) => (
              <label className="check" key={modelKey(ref)}>
                <input
                  type="checkbox"
                  checked={w.compareModels.some(
                    (m) => modelKey(m) === modelKey(ref),
                  )}
                  disabled={
                    !w.compareModels.some(
                      (m) => modelKey(m) === modelKey(ref),
                    ) && w.compareModels.length >= 4
                  }
                  onChange={(e) =>
                    w.setCompareModels((ms) =>
                      e.target.checked
                        ? [...ms, ref]
                        : ms.filter((m) => modelKey(m) !== modelKey(ref)),
                    )
                  }
                />
                {modelLabel(w.catalog, ref)}
              </label>
            ))}
          </div>
          <Button
            className="full"
            onClick={w.compare}
            disabled={
              w.busy ||
              w.compareModels.length < 2 ||
              whole ||
              (!w.isLensTarget && !w.responseAnswer.trim())
            }
          >
            {w.running?.label.startsWith("Comparing")
              ? "Comparing…"
              : "Compare selected models"}
          </Button>
          <p className="small muted">
            2–4 configured models. Live comparison can incur one request per
            model. Successful candidates are saved as takes, never activated.
          </p>
        </details>
        <Button className="text-button" onClick={() => w.setPanel("providers")}>
          <Settings2 size={14} />
          AI provider settings
        </Button>
      </div>
    </details>
  );
}

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
  return (
    (p?.models.find((m) => m.id === ref.modelId)?.displayName ?? ref.modelId) +
    " · " +
    (p?.displayName ?? ref.providerId)
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
      ready: p.configured && p.enabled && p.implemented,
    })),
  );
  const choices = models.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      (value && modelKey(value) === modelKey(m.ref)),
  );
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
                {modelLabel(catalog, value)} (unavailable)
              </option>
            )}
          {choices.map((m) => (
            <option
              disabled={!m.ready}
              key={modelKey(m.ref)}
              value={modelKey(m.ref)}
            >
              {m.name}
              {m.ready ? "" : " (not available)"}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
export function ModelControls({ w }: { w: Workspace }) {
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  const whole = w.responseTarget?.scope === "document";
  const available = (w.catalog?.providers ?? [])
    .filter((p) => p.implemented && p.configured && p.enabled)
    .flatMap((p) => p.models.map((m) => ({ providerId: p.id, modelId: m.id })));
  return (
    <details className="model-controls">
      <summary aria-label="Model controls">
        <span>{modelLabel(w.catalog, w.effectiveModel.model)}</span>
        <ChevronDown size={14} />
      </summary>
      <div className="model-controls-body">
        <p className="small muted">
          Inherited from: {w.effectiveModel.source.replace("_", " ")}. Changing
          a model never changes your text.
        </p>
        {section && !whole && (
          <>
            <ModelPicker
              catalog={w.catalog}
              value={section.modelOverride}
              onChange={w.setSectionModel}
              label="Section model"
              inherit="Inherit routing defaults"
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
          value={w.oneOffModel}
          onChange={w.setOneOffModel}
          label="Run with"
          inherit="Normal route · no one-off override"
        />
        <p className="small muted">
          Run with is consumed by the next single-model operation only,
          including diagnosis.
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
              (!w.isLensTarget && !w.answer.trim())
            }
          >
            Compare selected models
          </Button>
          <p className="small muted">
            2–4 configured models. Live comparison can incur one request per
            model. Successful candidates are saved as variants, never activated.
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

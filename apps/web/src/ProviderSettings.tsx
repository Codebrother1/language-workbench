import { useState } from "react";
import { type Workspace, api } from "./useWorkspace";
import {
  type ProviderDescriptor,
  routingPreferencesSchema,
  sectionKinds,
  writingActions,
} from "./domain";
import { ModelPicker } from "./ModelControls";
import { Field, Button, Select } from "./ui";
import { SectionConceptSelect } from "./SectionConceptHelp";
function ProviderCard({
  provider: p,
  w,
}: {
  provider: ProviderDescriptor;
  w: Workspace;
}) {
  const [modelId, setModelId] = useState(""),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState("");
  const run = async (path: string, method = "POST", body: unknown = {}) => {
    setPending(true);
    setStatus("");
    try {
      const result = await api<{ message?: string }>(
        `/providers/${p.id}${path}`,
        method,
        body,
      );
      await w.refreshCatalog();
      setStatus(result.message ?? "Updated");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const keys: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    vercel: "VERCEL_AI_GATEWAY_API_KEY",
    custom: "CUSTOM_OPENAI_API_KEY",
  };
  return (
    <section className="provider-card">
      <div className="row between">
        <h3>{p.displayName}</h3>
        <span className="tag">
          {p.implemented
            ? p.configured
              ? "Configured"
              : "Not configured"
            : "Not implemented"}
        </span>
      </div>
      <p>{p.status}</p>
      {p.credentialSuffix && (
        <p className="small">Credential: ••••{p.credentialSuffix}</p>
      )}
      {keys[p.id] && (
        <p className="small muted">
          Set {keys[p.id]} in the backend’s root .env and restart. No key is
          entered or stored in the browser.
        </p>
      )}
      {p.id === "openai" && (
        <p className="small muted">
          Test connection sends a tiny request to the selected provider model
          and may incur usage charges.
        </p>
      )}
      {p.implemented && (
        <>
          <div className="row wrap">
            <Button
              disabled={pending || !p.configured || !p.enabled}
              onClick={() => run("/test")}
            >
              Test connection · {p.displayName}
            </Button>
            <Button
              disabled={pending || !p.configured || !p.enabled}
              onClick={() => run("/models/refresh")}
            >
              Refresh models · {p.displayName}
            </Button>
            <Button
              disabled={pending}
              onClick={() => run("", "PATCH", { enabled: !p.enabled })}
            >
              {p.enabled ? "Disable" : "Enable"} {p.displayName}
            </Button>
          </div>
          <p className="small muted">
            {p.models.length} models ·{" "}
            {p.lastRefreshedAt
              ? "Last refreshed " + new Date(p.lastRefreshedAt).toLocaleString()
              : "Catalog not refreshed yet"}
          </p>
          {p.id !== "mock" && (
            <details>
              <summary>Enter model ID manually</summary>
              <Field label={"Manual model ID · " + p.displayName}>
                <input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="Provider model ID"
                />
              </Field>
              <Button
                disabled={pending || !modelId.trim()}
                onClick={() => run("/models", "POST", { id: modelId.trim() })}
              >
                Add model ID
              </Button>
              <p className="small muted">
                Registering an ID is not proof of availability or
                structured-output support. A failed model never silently
                switches to another.
              </p>
            </details>
          )}
        </>
      )}
      {status && (
        <p className="guidance" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
export function ProviderSettings({ w }: { w: Workspace }) {
  const [task, setTask] = useState("words"),
    [kind, setKind] = useState<(typeof sectionKinds)[number]>("Hook");
  const prefs = routingPreferencesSchema.parse(w.settings.routing ?? {});
  return (
    <>
      <p className="panel-intro">
        Models are tools, not document owners. Credentials remain in the local
        backend. Only OpenAI Direct and the explicitly offline fixtures are
        implemented in this checkpoint.
      </p>
      <details open>
        <summary>Defaults & inheritance</summary>
        <ModelPicker
          catalog={w.catalog}
          value={w.doc.defaultModel}
          onChange={w.setDocumentModel}
          label="Document default model"
          inherit="Use application default"
        />
        <details>
          <summary>Application and task defaults</summary>
          <ModelPicker
            catalog={w.catalog}
            value={prefs.applicationDefault}
            onChange={(ref) =>
              w.saveSettings({
                ...w.settings,
                routing: { ...prefs, applicationDefault: ref },
              })
            }
            label="Application default model"
            inherit="Use environment default"
          />
          <Field label="Task default">
            <Select value={task} onChange={(e) => setTask(e.target.value)}>
              {["culture", ...writingActions].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <ModelPicker
            catalog={w.catalog}
            value={prefs.taskDefaults[task]}
            onChange={(ref) => w.setTaskModel(task, ref)}
            label="Task model"
            inherit="No task override"
          />
          <SectionConceptSelect
            label="Section type default"
            value={kind}
            onChange={setKind}
          />
          <ModelPicker
            catalog={w.catalog}
            value={prefs.sectionTypeDefaults[kind]}
            onChange={(ref) => {
              const defaults = { ...prefs.sectionTypeDefaults };
              if (ref) defaults[kind] = ref;
              else delete defaults[kind];
              void w.saveSettings({
                ...w.settings,
                routing: { ...prefs, sectionTypeDefaults: defaults },
              });
            }}
            label="Section type model"
            inherit="No type override"
          />
        </details>
        <p className="small muted">
          Order: Run with → section → section type → task → document →
          application. This same resolver serves the Word/Phrase Lens.
        </p>
      </details>
      {(w.catalog?.providers ?? []).map((p) => (
        <ProviderCard key={p.id} provider={p} w={w} />
      ))}
      {!w.catalog && (
        <Button
          onClick={() => w.refreshCatalog().catch((e) => w.setError(e.message))}
        >
          Load provider catalog
        </Button>
      )}
    </>
  );
}

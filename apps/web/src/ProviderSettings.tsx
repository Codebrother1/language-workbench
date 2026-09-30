import { useEffect, useRef, useState } from "react";
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
  const [credentialStatus, setCredentialStatus] = useState<{
    configured: boolean;
    source: string;
    canStore: boolean;
  } | null>(null);
  const [secretMode, setSecretMode] = useState<"add" | "replace" | null>(null);
  const [secret, setSecret] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const secretInput = useRef<HTMLInputElement>(null);
  const desktop = p.id === "openai" ? window.workbenchDesktop : undefined;
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop
      .openAIStatus()
      .then((next) => {
        if (active) setCredentialStatus(next);
      })
      .catch(() => {
        if (active)
          setStatus("Credential status is unavailable. Check the desktop log.");
      });
    return () => {
      active = false;
    };
  }, [desktop, p.configured]);
  const changeKey = async (remove: boolean) => {
    if (!desktop) return;
    setPending(true);
    setStatus("");
    try {
      const next = remove
        ? await desktop.removeOpenAIKey()
        : await desktop.saveOpenAIKey(secret);
      setCredentialStatus(next);
      setSecret("");
      setSecretMode(null);
      setConfirmRemove(false);
      await w.refreshCatalog();
      setStatus(
        remove
          ? "Local API key removed. Model selections were kept; no fallback was used."
          : "API key saved locally. Test the connection or refresh models explicitly.",
      );
    } catch {
      setStatus(
        remove
          ? "Could not remove the key. The previous credential was retained where possible."
          : "Could not save the key securely. The previous credential was retained where possible.",
      );
    } finally {
      setPending(false);
    }
  };
  const run = async (path: string, method = "POST", body: unknown = {}) => {
    setPending(true);
    setStatus("");
    try {
      const result = await api<{
        message?: string;
        provider?: ProviderDescriptor;
      }>(`/providers/${p.id}${path}`, method, body);
      await w.refreshCatalog();
      setStatus(
        method === "PATCH" && path === ""
          ? `${p.displayName} ${p.enabled ? "disabled" : "enabled"}`
          : path === "/models/refresh" && result.provider
            ? `Models refreshed · ${result.provider.models.filter((model) => model.availability === "available").length} compatible`
            : (result.message ?? "Updated"),
      );
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
        {p.implemented ? (
          <div className="row wrap">
            <span className="tag">{p.enabled ? "Enabled" : "Disabled"}</span>
            <span className="tag">
              {p.configured ? "Configured" : "Not configured"}
            </span>
          </div>
        ) : (
          <span className="tag">Not implemented</span>
        )}
      </div>
      <p>
        {desktop && !p.configured && p.enabled
          ? "Not configured: add an API key to enable OpenAI Direct."
          : p.status}
      </p>
      {p.credentialSuffix && (
        <p className="small">Credential: ••••{p.credentialSuffix}</p>
      )}
      {keys[p.id] && (
        <p className="small muted">
          {desktop
            ? "The API key stays on this Mac in OS-backed encrypted storage; it is not included in writing exports. Legacy desktop .env and process environment keys are still recognized."
            : `Set ${keys[p.id]} in the backend’s root .env and restart. No key is entered or stored in the browser.`}
        </p>
      )}
      {desktop && (
        <div className="desktop-credential-controls">
          <p className="small muted" role="status">
            {credentialStatus?.source === "environment"
              ? "Configured from external environment or legacy .env. A key saved here takes precedence."
              : credentialStatus?.source === "unavailable"
                ? "The saved key is unavailable from secure storage; replace or remove it."
                : credentialStatus?.configured
                  ? "API key saved on this Mac · hidden"
                  : "No desktop API key configured."}
          </p>
          {credentialStatus && !credentialStatus.canStore && (
            <p className="small muted" role="alert">
              Secure desktop storage is unavailable. An existing server
              environment key may still work; no key will be saved from this
              screen.
            </p>
          )}
          {!secretMode && !confirmRemove && (
            <div className="row wrap">
              <Button
                disabled={pending || !credentialStatus?.canStore}
                onClick={() => {
                  setSecretMode(
                    credentialStatus?.configured ||
                      credentialStatus?.source === "unavailable"
                      ? "replace"
                      : "add",
                  );
                  requestAnimationFrame(() => secretInput.current?.focus());
                }}
              >
                {credentialStatus?.configured ||
                credentialStatus?.source === "unavailable"
                  ? "Replace key"
                  : "Add API key"}
              </Button>
              {(credentialStatus?.configured ||
                credentialStatus?.source === "unavailable") && (
                <Button
                  disabled={pending}
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove key
                </Button>
              )}
            </div>
          )}
          {secretMode && (
            <div className="credential-entry">
              <Field
                label={
                  secretMode === "add"
                    ? "New OpenAI API key"
                    : "Replacement OpenAI API key"
                }
              >
                <input
                  ref={secretInput}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </Field>
              <div className="row wrap">
                <Button
                  disabled={pending || secret.trim().length < 8}
                  onClick={() => void changeKey(false)}
                >
                  Save API key
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => {
                    setSecret("");
                    setSecretMode(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {confirmRemove && (
            <div
              className="credential-entry"
              role="group"
              aria-label="Confirm API key removal"
            >
              <p>
                Remove the locally configured API key? Documents and model
                routes stay intact. OpenAI will be unavailable until you add a
                new key. Any legacy .env file remains untouched.
              </p>
              <div className="row wrap">
                <Button disabled={pending} onClick={() => void changeKey(true)}>
                  Confirm remove key
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <Button onClick={() => void desktop.openDataFolder()}>
            Open desktop data folder
          </Button>
        </div>
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
            {p.id === "mock"
              ? `${p.models.length} models`
              : p.lastRefreshedAt
                ? `${p.models.filter((model) => model.availability === "available").length} available models`
                : `${p.models.length} locally known models`}{" "}
            ·{" "}
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

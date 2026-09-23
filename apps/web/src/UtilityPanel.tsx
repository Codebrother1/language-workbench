import { useState } from "react";
import { Plus, Trash2, ExternalLink, Copy, RefreshCw } from "lucide-react";
import {
  contentTypeConfig,
  contentTypes,
  uid,
  type Settings,
  type WritingBrief,
  type SourceMaterial,
} from "./domain";
import type { Workspace } from "./useWorkspace";
import { Dialog, Button, Field, Select, safeURL } from "./ui";
const words = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const nice = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
function Brief({ w }: { w: Workspace }) {
  const b = w.doc.brief;
  const change = (key: keyof WritingBrief, value: unknown) =>
    w.update((d) => ({ ...d, brief: { ...d.brief, [key]: value } }));
  return (
    <>
      <p className="panel-intro">
        Give the writing a job, not a formula. These notes inform every
        diagnosis; they never generate a template.
      </p>
      <div className="form-grid">
        <Field label="Content type">
          <Select
            value={b.contentType}
            onChange={(e) => change("contentType", e.target.value)}
          >
            {contentTypes.map((t) => (
              <option key={t} value={t}>
                {contentTypeConfig[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destination">
          <input
            value={b.destination}
            onChange={(e) => change("destination", e.target.value)}
            placeholder="Where will this live?"
          />
        </Field>
      </div>
      <p className="guidance">{contentTypeConfig[b.contentType].guidance}</p>
      <Field label="Audience">
        <input
          value={b.audience}
          onChange={(e) => change("audience", e.target.value)}
          placeholder="Who are you talking to?"
        />
      </Field>
      {(["objectives", "desiredReactions", "excludedFrameworks"] as const).map(
        (k) => (
          <Field key={k} label={nice(k) + " (comma-separated)"}>
            <input
              defaultValue={b[k].join(", ")}
              onBlur={(e) => change(k, words(e.target.value))}
            />
          </Field>
        ),
      )}
      <div className="form-grid">
        <Field label="Source material type">
          <Select
            value={b.sourceMaterialType}
            onChange={(e) => change("sourceMaterialType", e.target.value)}
          >
            {[
              "none",
              "text",
              "comment",
              "article",
              "clip",
              "transcript",
              "repo",
              "announcement",
              "other",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Framework preference">
          <Select
            value={b.frameworkPreference}
            onChange={(e) => change("frameworkPreference", e.target.value)}
          >
            {["none", "reference_only", "intentional"].map((t) => (
              <option key={t} value={t}>
                {nice(t.replaceAll("_", " "))}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Desired length">
        <input
          value={b.desiredLength}
          onChange={(e) => change("desiredLength", e.target.value)}
          placeholder="As long as it needs, or a specific limit"
        />
      </Field>
      <Field label="Custom notes">
        <textarea
          rows={4}
          value={b.customNotes}
          onChange={(e) => change("customNotes", e.target.value)}
          placeholder="Constraints, context, non-negotiables…"
        />
      </Field>
    </>
  );
}
function Sources({ w }: { w: Workspace }) {
  const patch = (id: string, key: keyof SourceMaterial, value: string) =>
    w.update((d) => ({
      ...d,
      sources: d.sources.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    }));
  return (
    <>
      <p className="panel-intro">
        Reference, not instructions. Sources are read-only context for the AI
        and never part of the editable writing target.
      </p>
      {w.doc.sources.map((source, i) => (
        <section key={source.id} className="source">
          <div className="row between">
            <span className="eyebrow">
              REFERENCE {String(i + 1).padStart(2, "0")}
            </span>
            <Button
              aria-label="Remove source"
              onClick={() =>
                w.update((d) => ({
                  ...d,
                  sources: d.sources.filter((s) => s.id !== source.id),
                }))
              }
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <div className="form-grid">
            <Field label="Reference title">
              <input
                value={source.title}
                onChange={(e) => patch(source.id, "title", e.target.value)}
              />
            </Field>
            <Field label="Material kind">
              <Select
                value={source.kind}
                onChange={(e) => patch(source.id, "kind", e.target.value)}
              >
                {[
                  "text",
                  "comment",
                  "quote",
                  "transcript",
                  "article",
                  "repo",
                  "notes",
                  "other",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Source text">
            <textarea
              rows={7}
              value={source.text}
              onChange={(e) => patch(source.id, "text", e.target.value)}
              placeholder="Paste the original material. Keep your writing in the editor."
            />
          </Field>
          <Field label="Source URL (optional)">
            <input
              type="url"
              value={source.url}
              onChange={(e) => patch(source.id, "url", e.target.value)}
              placeholder="https://…"
            />
          </Field>
          {safeURL(source.url) && (
            <a
              href={safeURL(source.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source <ExternalLink size={12} />
            </a>
          )}
        </section>
      ))}
      <Button
        onClick={() =>
          w.update((d) => ({
            ...d,
            sources: [
              ...d.sources,
              {
                id: uid(),
                title: "Reference " + (d.sources.length + 1),
                kind: "text",
                text: "",
                url: "",
              },
            ],
          }))
        }
      >
        <Plus size={15} />
        Add reference
      </Button>
    </>
  );
}
function Style({ w }: { w: Workspace }) {
  const [draft, setDraft] = useState<Settings>(w.settings);
  const style = draft.styleDNA;
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, styleDNA: { ...d.styleDNA, [key]: value } }));
  return (
    <>
      <p className="panel-intro">
        Describe what sounds like you. These preferences guide choices, not a
        style imitation machine.
      </p>
      <details open>
        <summary>Voice & cadence</summary>
        <div className="form-grid">
          {Object.entries(style)
            .filter(([, v]) => !Array.isArray(v))
            .map(([key, value]) => (
              <Field key={key} label={nice(key)}>
                {typeof value === "boolean" ? (
                  <Select
                    value={String(value)}
                    onChange={(e) => set(key, e.target.value === "true")}
                  >
                    <option value="true">Preserve intentional fragments</option>
                    <option value="false">Prefer complete sentences</option>
                  </Select>
                ) : key === "profanity" ? (
                  <Select
                    value={value}
                    onChange={(e) => set(key, e.target.value)}
                  >
                    {["preserve", "avoid", "welcome"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Select>
                ) : (
                  <textarea
                    rows={2}
                    value={String(value)}
                    onChange={(e) => set(key, e.target.value)}
                  />
                )}
              </Field>
            ))}
        </div>
      </details>
      <details>
        <summary>Vocabulary & boundaries</summary>
        {Object.entries(style)
          .filter(([, v]) => Array.isArray(v))
          .map(([key, value]) => (
            <Field key={key} label={nice(key) + " (one per line)"}>
              <textarea
                rows={3}
                value={(value as string[]).join("\n")}
                onChange={(e) => set(key, e.target.value.split("\n"))}
              />
            </Field>
          ))}
      </details>
      <details>
        <summary>
          Knowledge packs{" "}
          <span className="count">
            {draft.knowledgePacks.filter((p) => p.enabled).length} on
          </span>
        </summary>
        <p className="small muted">
          Mechanisms to consult, never mandatory frameworks.
        </p>
        {draft.knowledgePacks.map((pack) => (
          <div className="knowledge" key={pack.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={pack.enabled}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    knowledgePacks: d.knowledgePacks.map((p) =>
                      p.id === pack.id
                        ? { ...p, enabled: e.target.checked }
                        : p,
                    ),
                  }))
                }
              />
              {pack.name}
            </label>
            <textarea
              aria-label={pack.name + " principles"}
              rows={3}
              value={pack.principles}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  knowledgePacks: d.knowledgePacks.map((p) =>
                    p.id === pack.id ? { ...p, principles: e.target.value } : p,
                  ),
                }))
              }
            />
          </div>
        ))}
      </details>
      <div className="sticky-footer">
        <Button
          className="primary"
          onClick={async () => {
            await w.saveSettings(draft);
          }}
        >
          Save voice preferences
        </Button>
      </div>
    </>
  );
}
function Radar({ w }: { w: Workspace }) {
  const [query, setQuery] = useState(
    "Current language patterns and internet rhetoric",
  );
  return (
    <>
      <p className="panel-intro">
        Understand the construction, not just the catchphrase. Save language
        deliberately; nothing is inserted into your writing.
      </p>
      <Field label="Research topic">
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      <Button
        className="primary"
        disabled={!w.health.webResearch || w.busy || !query.trim()}
        onClick={() => w.refreshRadar(query)}
      >
        <RefreshCw size={14} />
        {w.busy ? "Researching…" : "Refresh live research"}
      </Button>
      {!w.health.webResearch && (
        <p className="guidance">
          Live research is unavailable for the current provider. Existing saved
          items remain accessible. No fake trends or citations are generated.
        </p>
      )}
      {w.settings.radar.length === 0 && (
        <p className="empty-note">
          No radar items yet. Your own language is always the starting point.
        </p>
      )}
      {w.settings.radar.map((item) => (
        <article className="radar-card" key={item.id}>
          <div className="row between">
            <h3>{item.term}</h3>
            <Select
              aria-label={"Status for " + item.term}
              value={item.status}
              onChange={(e) =>
                w.saveSettings({
                  ...w.settings,
                  radar: w.settings.radar.map((r) =>
                    r.id === item.id
                      ? { ...r, status: e.target.value as typeof item.status }
                      : r,
                  ),
                })
              }
            >
              {["saved", "maybe", "dislike", "never_suggest"].map((s) => (
                <option value={s} key={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </div>
          <p>{item.meaning}</p>
          <dl>
            {(
              [
                "mechanism",
                "pattern",
                "seriousUsage",
                "ironicUsage",
                "exampleStructure",
                "caveat",
              ] as const
            ).map((k) => (
              <div key={k}>
                <dt>{nice(k)}</dt>
                <dd>{item[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="small">Related: {item.relatedTerms.join(", ")}</p>
          <div className="citation">
            Verified {new Date(item.lastVerifiedAt).toLocaleDateString()} ·
            Discovered {new Date(item.discoveredAt).toLocaleDateString()}
            {item.sources.map((s, i) => (
              <a
                key={i}
                href={safeURL(s.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title} <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </article>
      ))}
    </>
  );
}
function History({ w }: { w: Workspace }) {
  return (
    <>
      <p className="panel-intro">
        A record of proposals, your direction, and what you chose. Undo and redo
        in the editor still use the normal editing history.
      </p>
      {!w.doc.history.length && (
        <p className="empty-note">
          No proposals yet. Start with your own words.
        </p>
      )}
      {[...w.doc.history].reverse().map((h) => (
        <article className="history-card" key={h.id}>
          <div className="row between">
            <span className="tag">{h.state}</span>
            <span className="small muted">
              {new Date(h.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="small muted">
            {h.provider} · {h.target.scope} target
          </p>
          <details>
            <summary>Original target & direction</summary>
            <blockquote>{h.target.text}</blockquote>
            <p>{h.instruction}</p>
            <p>{h.coachQuestion}</p>
            <p>{h.userAnswer}</p>
          </details>
          <p className="preserve">{h.proposal}</p>
          <Button onClick={() => w.copy(h.proposal)}>
            <Copy size={13} />
            Copy proposal
          </Button>
          {h.target.sectionId && (
            <Button
              onClick={() => {
                w.setPanel(null);
                w.focusSection(h.target.sectionId!);
              }}
            >
              Focus section
            </Button>
          )}
        </article>
      ))}
    </>
  );
}
export function UtilityPanel({ w }: { w: Workspace }) {
  if (!w.panel) return null;
  const title = {
    brief: "Writing brief",
    sources: "Source material",
    style: "Style DNA & knowledge",
    radar: "Language radar",
    history: "Operation history",
  }[w.panel];
  return (
    <Dialog title={title} close={() => w.setPanel(null)} wide>
      {w.panel === "brief" ? (
        <Brief w={w} />
      ) : w.panel === "sources" ? (
        <Sources w={w} />
      ) : w.panel === "style" ? (
        <Style w={w} />
      ) : w.panel === "radar" ? (
        <Radar w={w} />
      ) : (
        <History w={w} />
      )}
    </Dialog>
  );
}

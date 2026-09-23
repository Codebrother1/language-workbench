import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../apps/server/src/app';
import { createRepository, type Repository } from '../apps/server/src/repository';
import { MockProvider } from '../apps/server/src/mock-provider';

let directory: string;
let repository: Repository;
let server: Server;
let provider: MockProvider;
let base: string;
async function start() {
  repository = createRepository(directory);
  provider = new MockProvider();
  const app = createApp({ repository, provider });
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function stop() {
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  repository?.close();
}
async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function fixture(text = 'I really utilize this in order to help.', kind = 'Freeform') {
  const doc = await (await request('/api/documents', 'POST', { title: 'My draft', text })).json();
  doc.sections[0].kind = kind;
  doc.sections[0].label = kind;
  const settings = await (await request('/api/settings')).json();
  return {
    readContext: { document: doc, styleDNA: settings.styleDNA, knowledgePacks: settings.knowledgePacks, approvedLanguage: settings.radar },
    editTarget: { scope: 'section', sectionId: doc.sections[0].id, start: 0, end: text.length, text, sectionSnapshot: text, documentId: doc.id, documentRevision: doc.revision },
    action: 'coach', stage: 'diagnose', answer: '', instruction: '', controls: {}, variantCount: 2,
  };
}
beforeEach(async () => { directory = mkdtempSync(join(tmpdir(), 'workbench-server-')); await start(); });
afterEach(async () => { vi.restoreAllMocks(); await stop(); rmSync(directory, { recursive: true, force: true }); });

describe('local API and SQLite persistence', () => {
  it('CRUD persists through a server/repository restart and rejects stale saves', async () => {
    expect(await (await request('/api/documents')).json()).toEqual([]);
    const create = await request('/api/documents', 'POST', { title: 'Local draft', text: 'Human writing.' });
    expect(create.status).toBe(201);
    const first = await create.json();
    expect(first.revision).toBe(0);
    const updated = await (await request(`/api/documents/${first.id}`, 'PUT', { ...first, title: 'Revised' })).json();
    expect(updated.revision).toBe(1);
    expect((await request(`/api/documents/${first.id}`, 'PUT', first)).status).toBe(409);
    await stop(); await start();
    expect(await (await request(`/api/documents/${first.id}`)).json()).toEqual(updated);
    expect((await request(`/api/documents/${first.id}`, 'DELETE')).status).toBe(204);
    expect((await request(`/api/documents/${first.id}`)).status).toBe(404);
  });
  it('duplicates imports safely without overwriting the original', async () => {
    const ai = await fixture();
    const original = ai.readContext.document;
    original.history.push({ id: 'historical', createdAt: original.createdAt, target: ai.editTarget, instruction: '', coachQuestion: '', userAnswer: 'human', proposal: 'candidate', state: 'saved', provider: 'mock' });
    original.sections[0].variants.push({ id: 'variant', label: 'Saved', text: 'candidate', target: ai.editTarget, createdAt: original.createdAt, origin: 'human' });
    const response = await request('/api/import', 'POST', { document: original });
    expect(response.status).toBe(201);
    const imported = await response.json();
    expect(imported.id).not.toBe(original.id);
    expect(imported.sections[0].id).not.toBe(original.sections[0].id);
    expect(imported.history[0].target.documentId).toBe(imported.id);
    expect(imported.sections[0].variants[0].target.sectionId).toBe(imported.sections[0].id);
    expect((await (await request('/api/documents')).json()).length).toBe(2);
  });
  it('settings survive restart, invalid bodies are 400, route IDs must match', async () => {
    const settings = await (await request('/api/settings')).json();
    settings.theme = 'dark';
    settings.styleDNA.neverSuggest = ['synergy'];
    expect((await request('/api/settings', 'PUT', settings)).status).toBe(200);
    await stop(); await start();
    expect(await (await request('/api/settings')).json()).toEqual(settings);
    expect((await request('/api/settings', 'PUT', { theme: 'invalid' })).status).toBe(400);
    expect((await request('/api/documents', 'POST', { title: '' })).status).toBe(400);
    const ai = await fixture();
    expect((await request(`/api/documents/${ai.readContext.document.id}`, 'PUT', { ...ai.readContext.document, id: 'wrong' })).status).toBe(400);
  });
  it('returns safe errors and never reveals a configured key', async () => {
    const secret = 'sk-test-secret-do-not-disclose';
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = secret;
    try {
      expect(await (await request('/api/health')).json()).toEqual({ ok: true, provider: 'mock', webResearch: false });
      const ai = await fixture();
      vi.spyOn(provider, 'run').mockRejectedValueOnce(new Error(`Provider failed with ${secret}`));
      const failed = await request('/api/ai', 'POST', ai);
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain(secret);
      vi.spyOn(repository, 'list').mockImplementationOnce(() => { throw new Error(secret); });
      const internal = await request('/api/documents');
      expect(internal.status).toBe(500);
      expect(await internal.text()).not.toContain(secret);
      expect(await (await request('/api/settings')).text()).not.toContain(secret);
    } finally { if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; }
  });
});

describe('human-first AI boundaries', () => {
  it('coaches a section without proposals or writes, then proposes a conservative trim', async () => {
    const ai = await fixture('I really want to help in order to finish.', 'Hook');
    const before = await (await request('/api/documents')).json();
    const coach = await (await request('/api/ai', 'POST', ai)).json();
    expect(coach.provider).toBe('mock');
    expect(coach.diagnosis).toContain('OFFLINE');
    expect(coach.question).toContain('Hook');
    expect(coach.proposals).toEqual([]);
    const proposal = await (await request('/api/ai', 'POST', { ...ai, action: 'shorten', stage: 'propose', answer: 'Keep the intent to help, remove fillers.' })).json();
    expect(proposal.proposals[0].text).toBe('I want to help to finish.');
    expect(await (await request('/api/documents')).json()).toEqual(before);
    const again = await (await request('/api/ai', 'POST', { ...ai, action: 'shorten', stage: 'propose', answer: 'Keep the intent to help, remove fillers.' })).json();
    expect(again).toEqual(proposal);
  });
  it('rejects invalid ranges, snapshots, revisions, document editing and unanswered proposals', async () => {
    const ai = await fixture();
    const invalids = [
      { ...ai, editTarget: { ...ai.editTarget, end: 999 } },
      { ...ai, editTarget: { ...ai.editTarget, start: -1 } },
      { ...ai, editTarget: { ...ai.editTarget, documentRevision: 123 } },
      { ...ai, editTarget: { ...ai.editTarget, sectionSnapshot: 'old' } },
      { ...ai, editTarget: { ...ai.editTarget, scope: 'document', sectionId: null }, action: 'shorten' },
      { ...ai, stage: 'propose', action: 'humor', answer: '' },
      { ...ai, variantCount: 9 },
    ];
    for (const invalid of invalids) expect((await request('/api/ai', 'POST', invalid)).status).toBe(400);
    expect((await request('/api/ai', 'POST', { ...ai, action: 'critique', editTarget: { ...ai.editTarget, scope: 'document', sectionId: null, start: 9 } })).status).toBe(400);
  });
  it('offers lexical nuance from a small curated table and an honest unknown fallback', async () => {
    const ai = await fixture('assumed');
    const known = await (await request('/api/ai', 'POST', { ...ai, action: 'words', editTarget: { ...ai.editTarget, scope: 'word' } })).json();
    expect(known.lexical.map((entry: { term: string }) => entry.term)).toEqual(expect.arrayContaining(['assumed', 'figured', 'believed']));
    expect(known.lexical[0].nuance).toContain('untested');
    const unknown = await fixture('sesquipedalian');
    const result = await (await request('/api/ai', 'POST', { ...unknown, action: 'words' })).json();
    expect(result.lexical).toEqual([]);
    expect(result.diagnosis).toContain('not comprehensive');
  });
  it('flags generic transitions, uniform cadence and repeated contrasts with real section links', async () => {
    const ai = await fixture('Furthermore, birds can fly. Quiet clouds move slowly. Small leaves fall gently. It is not speed but care. It is not force but patience.');
    const output = await (await request('/api/ai', 'POST', { ...ai, action: 'critique' })).json();
    expect(output.findings.map((f: { title: string }) => f.title)).toEqual(expect.arrayContaining(['Stock bridge or opener', 'Repeated not-X-but-Y']));
    expect(output.findings.every((f: { sectionId: string }) => f.sectionId === ai.editTarget.sectionId)).toBe(true);
    const cadence = await fixture('Birds can fly. Clouds drift slowly. Leaves fall gently.');
    const cadenceOutput = await (await request('/api/ai', 'POST', { ...cadence, action: 'critique' })).json();
    expect(cadenceOutput.findings.some((f: { title: string }) => f.title === 'Uniform sentence cadence')).toBe(true);
  });
  it('spellchecks conservatively and protects quotes and explicit length constraints', async () => {
    const ai = await fixture('I recieve teh note: “teh source stays.”');
    const output = await (await request('/api/ai', 'POST', { ...ai, action: 'spellcheck' })).json();
    expect(output.proposals[0].text).toBe('I receive the note: “teh source stays.”');
    const bounded = await (await request('/api/ai', 'POST', { ...ai, action: 'spellcheck', controls: { maxWords: 1 } })).json();
    expect(bounded.proposals).toEqual([]);
    expect(bounded.missingIngredients[0]).toContain('maxWords');
    const simplify = await fixture('We utilize numerous tools.');
    const simple = await (await request('/api/ai', 'POST', { ...simplify, action: 'simplify', stage: 'propose', answer: 'For a general reader.' })).json();
    expect(simple.proposals[0].text).toBe('We use many tools.');
  });
  it('creative offline output explicitly uses human wording, never fabricated observations', async () => {
    const ai = await fixture('The room was quiet.');
    const human = 'Material: Even the fridge stopped humming.';
    const output = await (await request('/api/ai', 'POST', { ...ai, action: 'emotion', stage: 'propose', answer: human })).json();
    expect(output.proposals[0].text).toBe('Even the fridge stopped humming.');
    expect(output.proposals[0].label).toContain('verbatim');
    ai.readContext.styleDNA.neverSuggest = ['synergy'];
    const forbidden = await (await request('/api/ai', 'POST', { ...ai, action: 'humor', stage: 'propose', answer: 'We need synergy now.' })).json();
    expect(forbidden.proposals).toEqual([]);
  });
  it('offline culture is unavailable, not a fake fresh feed', async () => {
    const response = await request('/api/culture/refresh', 'POST', { query: 'current language patterns' });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('offline');
    expect((await request('/api/culture/refresh', 'POST', { query: '' })).status).toBe(400);
    expect((await (await request('/api/settings')).json()).radar).toEqual([]);
  });
});

describe('loopback / browser security', () => {
  it('denies hostile origins, DNS-rebinding hosts, opaque origins, and non-JSON mutations', async () => {
    for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example', 'http://user@localhost']) {
      expect((await request('/api/documents', 'POST', {}, { Origin: origin })).status).toBe(403);
    }
    // Native fetch normalizes/ignores Host overrides in some releases; node:http provides the raw-host check below.
    const { request: rawRequest } = await import('node:http');
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const raw = rawRequest(`${base}/api/health`, { headers: { Host: 'rebinding.attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
      raw.on('error', reject); raw.end();
    });
    expect(hostStatus).toBe(403);
    const text = await fetch(`${base}/api/documents`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(text.status).toBe(415);
    const allowed = await request('/api/health', 'GET', undefined, { Origin: 'http://localhost:5173' });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect((await request('/api/health', 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  });
  it('rejects malformed and oversized JSON safely', async () => {
    expect((await fetch(`${base}/api/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400);
    expect((await request('/api/documents', 'POST', { text: 'x'.repeat(2_100_000) })).status).toBe(413);
  });
});

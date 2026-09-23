import { createHash } from 'node:crypto';
import { labFor, sectionText, validateAIRequest, type AIRequest, type AIResponse, type LLMProvider, type LanguageRadarItem } from '@workbench/domain';
import { APIError } from './errors.js';
import { forbiddenPhrases, proposalViolation, validateProviderResponse } from './provider-policy.js';

const lexicon: AIResponse['lexical'] = [
  { term: 'assumed', meaning: 'Accepted something as true without verifying it.', nuance: 'Highlights an untested premise; can acknowledge mistaken confidence.', register: 'neutral', example: 'I assumed the door was unlocked.' },
  { term: 'figured', meaning: 'Reached a conclusion, often informally, from available clues.', nuance: 'Suggests practical inference rather than established proof.', register: 'conversational', example: 'I figured the lights meant someone was home.' },
  { term: 'believed', meaning: 'Held something to be true or trusted it.', nuance: 'Describes conviction; does not specify whether it was inferred or verified.', register: 'neutral', example: 'I believed her account of the meeting.' },
  { term: 'inferred', meaning: 'Drew a conclusion from evidence or reasoning.', nuance: 'Makes the reasoning step explicit, but does not guarantee a correct conclusion.', register: 'formal / technical', example: 'We inferred the direction from the tracks.' },
  { term: 'suspected', meaning: 'Thought something might be true without being certain.', nuance: 'Lower confidence; can carry doubt or a negative implication.', register: 'neutral', example: 'I suspected the battery was empty.' },
];
const actionQuestions: Partial<Record<AIRequest['action'], string>> = {
  shorten: 'Which claim or detail must survive, and what can disappear?',
  lengthen: 'What actual example, observation or explanation can you add? Paste the material in your own words.',
  simplify: 'Who needs to understand this, and which technical distinction must remain exact?',
  concrete: 'What did you actually see, hear or measure? Supply the detail rather than asking me to invent it.',
  specificity: 'Which exact object, behavior or measurement can replace the broad statement?',
  emotion: 'What observable behavior carried this feeling in the real situation?',
  humor: 'What real mismatch did you notice, and what is the joke allowed to target?',
  exaggeration: 'What true detail can be exaggerated, and where would exaggeration become a false claim?',
  tension: 'What did you know at this point, and what outcome was genuinely uncertain?',
  suspense: 'What known information can be withheld fairly, and when should it become clear?',
  reveal: 'What fact is being revealed, and what should the reader know immediately before it?',
  rhythm: 'Where do you want a breath or an impact? Mark the pause in your own wording.',
  directness: 'What is the precise point you want to state more directly?',
  register: 'Who are you speaking to, and which terms would you actually use with them?',
  figurative: 'What comparison comes from your experience, and which part of it genuinely fits?',
  technical: 'What assumptions, definitions or evidence must stay technically exact?',
  split: 'Where is the meaningful boundary? Mark it in your own wording; no sections will be created automatically.',
  combine: 'Paste the wording you want joined, and identify the relationship between the ideas.',
  reference_flip: 'Which saved reference are you using, and what actual observation changes its meaning?',
  break_template: 'Which recurring pattern is intentional, and which one can you remove without losing the point?',
  critique: 'Which of these observable patterns is intentional in your voice?',
};

function findingsFor(request: AIRequest): AIResponse['findings'] {
  const findings: AIResponse['findings'] = [];
  let contrastCount = 0;
  const contrastSections: string[] = [];
  for (const section of request.readContext.document.sections) {
    const text = sectionText(section);
    if (/\b(in conclusion|furthermore|moreover|at the end of the day|let['’]s dive in|here['’]s the thing|in today['’]s|but there['’]s more)\b/i.test(text)) {
      findings.push({ sectionId: section.id, title: 'Stock bridge or opener', detail: 'This section contains a generic transition/opening. Check whether it names a real relationship or just announces the next thought. It may be intentional.', severity: 'consider' });
    }
    const contrasts = text.match(/\bnot\b[^.!?\n]{1,100}\bbut\b/gi) ?? [];
    contrastCount += contrasts.length;
    if (contrasts.length) contrastSections.push(section.id);
    const sentences = text.match(/[^.!?\n]+[.!?](?:["”])?/g) ?? [];
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    if (lengths.length >= 3 && Math.max(...lengths) - Math.min(...lengths) <= 2) findings.push({ sectionId: section.id, title: 'Uniform sentence cadence', detail: `The ${lengths.length} detected sentences run ${Math.min(...lengths)}–${Math.max(...lengths)} words. Listen for an intentional beat versus accidental sameness; fragments and asymmetry are allowed. This is a simple punctuation-based heuristic.`, severity: 'consider' });
    const found = forbiddenPhrases(request).filter(p => text.toLowerCase().includes(p.toLowerCase()));
    if (found.length) findings.push({ sectionId: section.id, title: 'StyleDNA phrase check', detail: `Present in your avoidance list: ${[...new Set(found)].join('; ')}. This flags existing wording; it does not remove it.`, severity: 'check' });
  }
  if (contrastCount >= 2) for (const sectionId of new Set(contrastSections)) findings.push({ sectionId, title: 'Repeated not-X-but-Y', detail: `${contrastCount} not/but contrasts occur across the readable document. Keep the ones that make a necessary distinction; repetition is not automatically an error.`, severity: 'consider' });
  return findings;
}
/** Transform only unquoted segments. Preserve quotes, curly quotes and inline code verbatim. */
function outsideQuotes(text: string, transform: (text: string) => string): string {
  return text.split(/(“[^”]*”|"[^"\n]*"|‘[^’]*’|`[^`]*`)/g).map((part, i) => i % 2 ? part : transform(part)).join('');
}
const caseLike = (original: string, replacement: string) => original === original.toUpperCase() ? replacement.toUpperCase() : /^[A-Z]/.test(original) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
function replaceTerms(text: string, dictionary: Record<string, string>): string {
  return outsideQuotes(text, part => part.replace(new RegExp(`\\b(${Object.keys(dictionary).join('|')})\\b`, 'gi'), match => caseLike(match, dictionary[match.toLowerCase()])));
}
function offlineEdit(request: AIRequest): { text: string; explanation: string; label: string } | undefined {
  const original = request.editTarget.text;
  if (request.action === 'spellcheck') return { text: replaceTerms(original, { teh: 'the', recieve: 'receive', seperate: 'separate', definately: 'definitely', occured: 'occurred', untill: 'until', wierd: 'weird', adress: 'address' }), label: 'Known typo corrections', explanation: 'Small explicit typo table only. Quotes and code are protected; intentional grammar, fragments and punctuation are left alone.' };
  if (request.action === 'simplify') return { text: replaceTerms(original, { utilize: 'use', utilized: 'used', approximately: 'about', commence: 'begin', subsequent: 'later', assistance: 'help', numerous: 'many' }), label: 'Plain-word substitutions', explanation: 'Deterministic substitutions from a small table, not a semantic rewrite. Check that technical meanings remain exact.' };
  if (request.action === 'shorten') return { text: outsideQuotes(original, part => part.replace(/\b(in order to|due to the fact that|at this point in time|in the event that)\b/gi, match => caseLike(match, ({ 'in order to': 'to', 'due to the fact that': 'because', 'at this point in time': 'now', 'in the event that': 'if' } as Record<string,string>)[match.toLowerCase()])).replace(/\b(very|really|basically|actually)\s+/gi, '')), label: 'Conservative trim', explanation: 'Removes listed fillers and expands no claims. These words can convey emphasis: accept only if that emphasis is expendable.' };
  // No fictional creativity: a supplied answer is offered explicitly as human wording, never disguised as model authorship.
  if (request.answer.trim() && !['critique', 'break_template', 'words'].includes(request.action)) {
    const material = request.answer.replace(/^material:\s*/i, '').trim();
    return { text: material, label: 'Your supplied wording — verbatim', explanation: 'Offline mode cannot invent or infer a creative rewrite. This candidate is your answer verbatim (with an optional “Material:” label removed), for you to edit. If you gave directions rather than draft wording, do not accept it; supply the actual passage instead.' };
  }
  return undefined;
}

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  readonly capabilities = { webResearch: false, structuredGeneration: true };
  async run(request: AIRequest): Promise<AIResponse> {
    validateAIRequest(request);
    const section = request.readContext.document.sections.find(s => s.id === request.editTarget.sectionId);
    const lab = labFor(section?.kind ?? 'Freeform', request.editTarget.scope);
    const output: AIResponse = {
      provider: 'mock',
      diagnosis: `OFFLINE deterministic writing aid — not an LLM. ${request.editTarget.scope === 'document' ? 'Reviewing patterns in the document, not proposing a rewrite.' : `The edit boundary is the selected ${request.editTarget.scope}${section ? ` in ${section.label}` : ''}; the rest is context only.`}`,
      mechanism: `${lab.strategy} Offline checks use small explicit rules, not semantic understanding.`,
      question: `${actionQuestions[request.action] ?? lab.question}${section ? ` (${section.kind}; ${request.readContext.document.brief.contentType})` : ''}`,
      missingIngredients: [], proposals: [], findings: [], lexical: [],
    };
    if (['critique', 'break_template', 'coach'].includes(request.action)) output.findings = findingsFor(request);
    if (['critique', 'break_template'].includes(request.action) && !output.findings.length) output.diagnosis += ' No configured pattern was detected. That is not a verdict on quality.';
    if (request.action === 'words') {
      const word = request.editTarget.text.trim().toLowerCase().replace(/[.,!?;:]$/, '');
      if (lexicon.some(entry => entry.term === word)) {
        output.lexical = lexicon.map(entry => ({ ...entry }));
        output.diagnosis += ' These curated entries distinguish assumption, inference and conviction; they are not interchangeable synonyms.';
      } else {
        output.diagnosis += ` This offline dictionary is not comprehensive and has no curated entry for the selected text. No definition has been invented.`;
        output.missingIngredients = ['A reliable dictionary entry or the intended meaning in your own words'];
      }
      output.question = 'Do you mean an untested premise, a reasoned inference, or personal conviction? If none fits, describe your intended meaning.';
    }
    const allowed = request.editTarget.scope !== 'document' && !['critique', 'break_template'].includes(request.action) && (request.stage === 'propose' || request.action === 'spellcheck');
    if (allowed) {
      const edit = offlineEdit(request);
      if (edit && edit.text !== request.editTarget.text) {
        const problem = proposalViolation(request, edit.text);
        if (problem) { output.missingIngredients.push(`No safe offline proposal: ${problem}. Supply compliant wording or adjust the explicit constraints.`); }
        else output.proposals = [{ ...edit, id: `offline-${createHash('sha256').update(JSON.stringify([request.editTarget, request.action, edit.text])).digest('hex').slice(0, 16)}` }];
      } else if (!['words', 'coach'].includes(request.action)) {
        output.diagnosis += ' No applicable safe replacement was found in the offline rule set; unchanged text is not presented as a new variant.';
      }
    }
    return validateProviderResponse(request, output, 'mock');
  }
  async researchCulture(_query: string): Promise<LanguageRadarItem[]> {
    throw new APIError(503, 'Live culture research is unavailable in offline mode. Configure OPENAI_API_KEY for cited web research; no fresh culture results are fabricated.');
  }
}

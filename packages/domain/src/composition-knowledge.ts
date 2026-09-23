import type {
  CompositionRelationship,
  Connector,
  RelationshipId,
  SentenceScaffold,
  StructureRegister,
} from "./composition";

const connector = (
  id: string,
  text: string,
  registers: StructureRegister[],
  distinction: string,
): Connector => ({ id, text, registers, distinction });
const scaffold = (
  id: string,
  template: string,
  registers: StructureRegister[],
  effect: string,
): SentenceScaffold => ({ id, template, registers, effect });

/** Original, practical composition notes, not quotations from a handbook.
 * Registers are soft usage associations, not correctness rules or scientific classes.
 * Connectors are different grammatical tools, not interchangeable synonyms: some join
 * clauses, some introduce sentences, and some require a noun phrase. The scaffolds
 * demonstrate structural moves as well as explicit transitions. Slots remain the writer's.
 */
export const compositionKnowledge: CompositionRelationship[] = [
  {
    id: "add",
    label: "Add a companion idea",
    principle:
      "Place another relevant point beside the first without claiming opposition, order, or cause. Parallel syntax can show equal weight without a transition.",
    question:
      "Does Y add a separate point, and should it have equal or extra weight?",
    connectors: [
      connector(
        "add-and",
        "and",
        ["any"],
        "Coordinates comparable words or clauses; it does not establish that the second event follows or results from the first.",
      ),
      connector(
        "add-also",
        "also",
        ["conversational"],
        "Adds a point with little ceremony. Its position can emphasize the action or the person; it need not start a sentence.",
      ),
      connector(
        "add-furthermore",
        "furthermore",
        ["formal", "technical"],
        "Introduces additional argumentative support, usually as a sentence adverb; heavier than simple coordination.",
      ),
      connector(
        "add-plus",
        "plus",
        ["conversational", "sharp"],
        "Presents another benefit or consideration with a spoken, sometimes sales-like energy; not neutral evidence of equal importance.",
      ),
    ],
    scaffolds: [
      scaffold(
        "add-parallel",
        "[X]. [Y].",
        ["any"],
        "Juxtaposition gives both complete thoughts space. Their shared subject or parallel syntax must make the connection apparent.",
      ),
      scaffold(
        "add-extra",
        "[X]. Plus, [Y].",
        ["conversational", "sharp"],
        "Gives the second thought the feel of an extra consideration rather than formal supporting evidence.",
      ),
      scaffold(
        "add-support",
        "[X]. Furthermore, [Y].",
        ["formal", "technical"],
        "Builds a cumulative argument; use only when Y adds relevant support rather than changing the subject.",
      ),
    ],
  },
  {
    id: "contrast",
    label: "Set up a contrast",
    principle:
      "Set two differences or competing assessments against each other. Contrast does not require an expectation to be defeated; concession does. A narrow exception is a different move again.",
    question:
      "In what specific respect do X and Y differ, and which deserves the emphasis?",
    connectors: [
      connector(
        "contrast-but",
        "but",
        ["any"],
        "Direct clause-level opposition with little framing. It can join clauses inside one sentence; it is not punctuated like the sentence adverb however.",
      ),
      connector(
        "contrast-however",
        "however",
        ["formal", "technical"],
        "Marks a counterpoint across a sentence boundary or after a semicolon. It gives Y its own argumentative space; a comma alone cannot join two independent clauses with it.",
      ),
      connector(
        "contrast-yet",
        "yet",
        ["formal", "sharp"],
        "Adds the sense that Y is surprising despite X. This often shades contrast into concession rather than merely listing differences.",
      ),
      connector(
        "contrast-still",
        "still",
        ["conversational"],
        "As a discourse marker, maintains a counterpoint despite what came before. Inside a clause it may instead mean continuing in time; context decides.",
      ),
      connector(
        "contrast-even-so",
        "even so",
        ["conversational", "formal"],
        "Explicitly accepts the previous point while sustaining an opposing assessment; it is concessive, not a neutral difference marker.",
      ),
      connector(
        "contrast-that-said",
        "that said",
        ["conversational"],
        "Steps back from the speaker’s own previous assessment to add a qualification. It need not reverse the whole claim and can sound formulaic when repeated.",
      ),
      connector(
        "contrast-except",
        "except",
        ["any"],
        "Carves out a limited exclusion, rather than contradicting an entire proposition. Use except for with a noun phrase or except that with a clause, not as a drop-in replacement for but.",
      ),
      connector(
        "contrast-by-contrast",
        "by contrast",
        ["formal", "technical"],
        "Makes a comparison on an identifiable shared dimension explicit; it does not imply that the difference was unexpected.",
      ),
    ],
    scaffolds: [
      scaffold(
        "contrast-direct",
        "[X], but [Y].",
        ["any"],
        "One sentence puts the competing assessment in the final, prominent position; the slots need compatible clause forms.",
      ),
      scaffold(
        "contrast-reassess",
        "[X]. That said, [Y].",
        ["conversational"],
        "Makes a considered correction or qualification to the first assessment without discarding it.",
      ),
      scaffold(
        "contrast-separate",
        "[X]; however, [Y].",
        ["formal", "technical"],
        "Balances two independent clauses while giving the counterpoint a deliberate pause.",
      ),
      scaffold(
        "contrast-cut",
        "[X].\n[Y].",
        ["sharp"],
        "A paragraph break can make the reversal land without a connector; the thoughts themselves must reveal the opposition.",
      ),
    ],
  },
  {
    id: "concede",
    label: "Grant a point, then hold the line",
    principle:
      "Accept X while showing that it does not defeat Y. The writer grants a genuine limitation or rival argument; the main assertion usually belongs in Y.",
    question:
      "What am I willing to grant, and why does my main point still stand?",
    connectors: [
      connector(
        "concede-although",
        "although",
        ["any"],
        "Subordinates a granted clause so the main clause retains priority. It expresses a defeated expectation, not a simple difference.",
      ),
      connector(
        "concede-nevertheless",
        "nevertheless",
        ["formal", "technical"],
        "Maintains a conclusion despite an acknowledged obstacle; as a sentence adverb it requires its own punctuation.",
      ),
      connector(
        "concede-sure",
        "sure",
        ["conversational", "sharp"],
        "Signals a spoken concession, often before but. It may sound dismissive unless the granted point is treated fairly.",
      ),
      connector(
        "concede-despite",
        "despite",
        ["formal", "technical"],
        "Takes a noun phrase or an -ing phrase, not a bare independent clause; despite the fact that is a longer clause-taking alternative.",
      ),
    ],
    scaffolds: [
      scaffold(
        "concede-subordinate",
        "Although [X], [Y].",
        ["any"],
        "Grants X while making Y the main assertion; neither slot is evidence merely because the construction sounds confident.",
      ),
      scaffold(
        "concede-spoken",
        "Sure, [X]. But [Y].",
        ["conversational", "sharp"],
        "Acknowledges an objection in a spoken voice before returning the emphasis to Y.",
      ),
      scaffold(
        "concede-maintain",
        "[X]. Nevertheless, [Y].",
        ["formal", "technical"],
        "Gives the obstacle a full sentence, then states the position that survives it.",
      ),
    ],
  },
  {
    id: "cause",
    label: "Give a reason or cause",
    principle:
      "Explain why X happened or why X is claimed by supplying Y. A physical cause, a person’s reason, and evidence for a belief are different warrants; the writer must identify and support the intended one.",
    question:
      "Does Y actually explain X, or is it only correlated with it or evidence that X is true?",
    connectors: [
      connector(
        "cause-because",
        "because",
        ["any"],
        "Introduces the proposed reason. It can explain an event or justify an assertion, so the causal or evidential claim must be clear from the content.",
      ),
      connector(
        "cause-since",
        "since",
        ["formal"],
        "Can mean because or from a time onward. Avoid it where that temporal ambiguity would obscure the intended explanation.",
      ),
      connector(
        "cause-due-to",
        "due to",
        ["technical", "formal"],
        "Introduces an attributed cause as a noun phrase; it is not a clause-joining synonym for because, and the attribution still requires support.",
      ),
      connector(
        "cause-after-all",
        "after all",
        ["conversational"],
        "Appeals to a reason the reader is expected to recognize; it does not independently demonstrate a causal mechanism.",
      ),
    ],
    scaffolds: [
      scaffold(
        "cause-explain",
        "[X] because [Y].",
        ["any"],
        "States the outcome or claim first, then its proposed explanation. Use only when the writer can warrant that explanation.",
      ),
      scaffold(
        "cause-remind",
        "[X]. After all, [Y].",
        ["conversational"],
        "Offers Y as a familiar reason for accepting X rather than reporting a new experiment or proof.",
      ),
      scaffold(
        "cause-reason-first",
        "Because [Y], [X].",
        ["formal", "technical"],
        "Places the supported reason before the assertion. Fronting it changes emphasis, not the strength of the evidence.",
      ),
    ],
  },
  {
    id: "result",
    label: "Show a consequence",
    principle:
      "Move from a stated basis X to an outcome or inference Y. Chronological succession alone is not a result, and a logical conclusion is not necessarily a physical effect.",
    question:
      "What warrants the step from X to Y: a causal mechanism, a decision, or an inference?",
    connectors: [
      connector(
        "result-so",
        "so",
        ["conversational"],
        "Makes an economical move to an outcome or decision; its casualness does not remove the implied dependence on X.",
      ),
      connector(
        "result-therefore",
        "therefore",
        ["formal", "technical"],
        "Presents Y as an inference from X. The reasoning must be valid; a confident transition supplies no missing premise.",
      ),
      connector(
        "result-as-a-result",
        "as a result",
        ["any"],
        "Claims a consequence of the preceding situation, not merely something that happened later.",
      ),
      connector(
        "result-consequently",
        "consequently",
        ["formal"],
        "Summarizes an ensuing consequence across clauses or sentences; often heavier than so in personal narrative.",
      ),
    ],
    scaffolds: [
      scaffold(
        "result-consequence",
        "[X]. As a result, [Y].",
        ["any"],
        "Makes the dependency explicit. Reject this pattern when only time order is known.",
      ),
      scaffold(
        "result-decision",
        "[X], so [Y].",
        ["conversational"],
        "Keeps a reason and its outcome or response together in a compact sentence.",
      ),
      scaffold(
        "result-inference",
        "[X]. Therefore, [Y].",
        ["formal", "technical"],
        "Marks a reasoned inference for the reader to check, not an automatic proof.",
      ),
    ],
  },
  {
    id: "example",
    label: "Make an idea concrete",
    principle:
      "Follow a broader claim with a particular instance. An illustration helps readers picture a claim but one instance does not establish how typical or universal it is.",
    question:
      "Is Y a genuine instance of X, and what does it illustrate rather than prove?",
    connectors: [
      connector(
        "example-for-example",
        "for example",
        ["any"],
        "Introduces one instance without claiming that it exhausts the category or represents its frequency.",
      ),
      connector(
        "example-for-instance",
        "for instance",
        ["conversational"],
        "Often fits a casually offered case; the distinction from for example is largely rhythm and context, not a different logical relation.",
      ),
      connector(
        "example-such-as",
        "such as",
        ["formal", "technical"],
        "Attaches examples to a noun or category, usually as phrases rather than a free-standing sentence transition.",
      ),
      connector(
        "example-to-illustrate",
        "to illustrate",
        ["formal"],
        "Announces the purpose of the next passage explicitly; useful in exposition but conspicuous in a short personal sentence.",
      ),
    ],
    scaffolds: [
      scaffold(
        "example-instance",
        "[X]. For example, [Y].",
        ["any"],
        "Moves from a complete general claim to a complete illustrative claim.",
      ),
      scaffold(
        "example-look",
        "[X]. Here’s one example: [Y].",
        ["conversational"],
        "Invites attention to a concrete case while making no claim that it is representative.",
      ),
      scaffold(
        "example-demonstration",
        "[X]. To illustrate: [Y].",
        ["formal", "technical"],
        "Separates exposition from its illustration; Y may be a compact worked case, not an extra premise smuggled in as proof.",
      ),
    ],
  },
  {
    id: "clarify",
    label: "Restate or specify meaning",
    principle:
      "Make X easier to understand through an equivalent restatement or a more exact formulation Y. If Y changes the claim rather than explains it, acknowledge the correction.",
    question:
      "Does Y preserve X’s meaning, define a term, or actually narrow or correct the claim?",
    connectors: [
      connector(
        "clarify-in-other-words",
        "in other words",
        ["any"],
        "Promises a restatement with substantially the same meaning; it should not quietly introduce a stronger claim.",
      ),
      connector(
        "clarify-i-mean",
        "I mean",
        ["conversational"],
        "Allows a speaker to repair or sharpen their own wording. It can signal correction rather than strict equivalence.",
      ),
      connector(
        "clarify-that-is",
        "that is",
        ["formal", "technical"],
        "Introduces a more exact identification or definition; more restrictive than merely offering an example.",
      ),
      connector(
        "clarify-specifically",
        "specifically",
        ["formal", "technical"],
        "Moves from a broad formulation to a named detail; specificity can narrow scope instead of simply paraphrasing.",
      ),
    ],
    scaffolds: [
      scaffold(
        "clarify-restate",
        "[X]. In other words, [Y].",
        ["any"],
        "Explicitly promises a meaning-preserving restatement; compare both claims before using it.",
      ),
      scaffold(
        "clarify-repair",
        "[X]—I mean, [Y].",
        ["conversational"],
        "Makes an audible self-correction or refinement rather than hiding that the wording changed.",
      ),
      scaffold(
        "clarify-colon",
        "[X]: [Y].",
        ["formal", "technical"],
        "Lets a colon introduce an explanation or specification. X must be able to introduce what follows.",
      ),
    ],
  },
  {
    id: "qualify",
    label: "Limit the claim",
    principle:
      "Keep a claim while making its scope, confidence, or applicability more precise. The qualification should be near the claim it limits, not buried after a sweeping assertion.",
    question:
      "What boundary or uncertainty must a reader retain when accepting X?",
    connectors: [
      connector(
        "qualify-at-least",
        "at least",
        ["conversational"],
        "Sets a lower bound or retreats to a defensible narrower claim; its attachment determines exactly what is limited.",
      ),
      connector(
        "qualify-to-the-extent-that",
        "to the extent that",
        ["formal", "technical"],
        "Limits validity by degree or circumstance; it is more specific than a vague hedge such as perhaps.",
      ),
      connector(
        "qualify-with-one-caveat",
        "with one caveat",
        ["any"],
        "Announces an explicit limitation. The next words must actually identify the caveat rather than merely weaken the tone.",
      ),
      connector(
        "qualify-in-this-context",
        "in this context",
        ["formal", "technical"],
        "Restricts applicability to an identified setting; the setting must have been defined for this to be informative.",
      ),
    ],
    scaffolds: [
      scaffold(
        "qualify-caveat",
        "[X], with one caveat: [Y].",
        ["any"],
        "Keeps the limitation attached to the assertion it constrains.",
      ),
      scaffold(
        "qualify-pause",
        "[X]. One caveat, though: [Y].",
        ["conversational"],
        "Adds an audible pause for a concrete limitation without retracting everything.",
      ),
      scaffold(
        "qualify-degree",
        "[X] to the extent that [Y].",
        ["formal", "technical"],
        "Ties the claim’s validity to a stated degree or condition; Y needs to fit that role, not just be any second thought.",
      ),
    ],
  },
  {
    id: "escalate",
    label: "Raise the stakes",
    principle:
      "Move from X to a stronger, more consequential, or more surprising Y on an identifiable scale. Mere addition is not escalation, and intensity is not evidence.",
    question: "On which scale is Y greater, and have I earned that increase?",
    connectors: [
      connector(
        "escalate-more-importantly",
        "more importantly",
        ["any"],
        "Ranks the next point by importance, committing the writer to a defensible hierarchy rather than just adding emphasis.",
      ),
      connector(
        "escalate-worse",
        "worse",
        ["conversational", "sharp"],
        "Raises negative stakes; inappropriate when the second point is only different or is an improvement.",
      ),
      connector(
        "escalate-more-seriously",
        "more seriously",
        ["formal", "technical"],
        "Ranks consequences by seriousness. Identify whose consequences and which measure of severity justify the ordering.",
      ),
      connector(
        "escalate-not-only",
        "not only … but also",
        ["formal"],
        "Creates a two-part build through parallel syntax; without an actual increase it functions as addition rather than escalation.",
      ),
    ],
    scaffolds: [
      scaffold(
        "escalate-rank",
        "[X]. More importantly, [Y].",
        ["any"],
        "Makes an explicit claim that the second point matters more.",
      ),
      scaffold(
        "escalate-worse",
        "[X]. Worse, [Y].",
        ["conversational", "sharp"],
        "Gives the next negative consequence a short, forceful introduction.",
      ),
      scaffold(
        "escalate-serious",
        "[X]. More seriously, [Y].",
        ["formal", "technical"],
        "Raises the stated severity without relying on exclamation marks or emotive vocabulary.",
      ),
    ],
  },
  {
    id: "pivot",
    label: "Change the focus",
    principle:
      "Move to a new question or aspect while giving the reader enough reason to follow. A pivot changes the agenda; it need not contradict the previous claim.",
    question:
      "What new focus is needed, and what connection makes this change relevant?",
    connectors: [
      connector(
        "pivot-turning-to",
        "turning to",
        ["formal", "technical"],
        "Names a new topic, usually as a noun phrase; it organizes the discussion without claiming opposition.",
      ),
      connector(
        "pivot-as-for",
        "as for",
        ["any"],
        "Sets a topic apart for attention. Depending on context it can sound contrastive or dismissive, so name the topic clearly.",
      ),
      connector(
        "pivot-anyway",
        "anyway",
        ["conversational"],
        "Can close a digression or dismiss a preceding concern; the latter reading can undermine a serious objection.",
      ),
      connector(
        "pivot-the-next-question",
        "the next question is",
        ["formal"],
        "Makes the new agenda explicit rather than relying on a vague transitional adverb.",
      ),
    ],
    scaffolds: [
      scaffold(
        "pivot-break",
        "[X].\n\n[Y].",
        ["any"],
        "A new paragraph can change the focus without a transition; Y should establish its topic and the larger context must justify the move.",
      ),
      scaffold(
        "pivot-spoken",
        "[X]. Anyway, [Y].",
        ["conversational"],
        "Resets a spoken discussion; check that the reset does not dismiss an unresolved problem.",
      ),
      scaffold(
        "pivot-agenda",
        "[X]. The next question is: [Y].",
        ["formal", "technical"],
        "Announces a new line of inquiry. Y must supply the actual question, not an unrelated assertion.",
      ),
    ],
  },
  {
    id: "return",
    label: "Return to the main thread",
    principle:
      "Reconnect after a digression, example, or qualification. Naming or echoing the earlier topic is often clearer than an abstract transition.",
    question:
      "Which earlier thread am I resuming, and can the reader recognize it?",
    connectors: [
      connector(
        "return-back-to",
        "back to",
        ["conversational"],
        "Names the topic being resumed, normally followed by a noun phrase; it cannot simply prefix any full clause.",
      ),
      connector(
        "return-to-return-to",
        "to return to",
        ["formal"],
        "Explicitly closes an excursion and names the earlier focus; useful when the digression was long enough to lose the thread.",
      ),
      connector(
        "return-as-noted-earlier",
        "as noted earlier",
        ["formal", "technical"],
        "Points to a prior assertion that must actually exist; it can reconnect reasoning without literally changing the topic.",
      ),
      connector(
        "return-again",
        "again",
        ["any"],
        "Can mean a restatement or a repeated event. The content must distinguish resuming a claim from reporting something happening twice.",
      ),
    ],
    scaffolds: [
      scaffold(
        "return-resume",
        "[X]. Again, [Y].",
        ["any"],
        "Restates the main point after an excursion; Y must already be grounded earlier, not introduced as if familiar.",
      ),
      scaffold(
        "return-back",
        "[X]. Back to the point: [Y].",
        ["conversational"],
        "Explicitly closes the detour and resumes the point in a spoken voice.",
      ),
      scaffold(
        "return-earlier",
        "[X]. As noted earlier, [Y].",
        ["formal", "technical"],
        "Connects a local discussion to an actual earlier claim; verify that the backward reference is accurate.",
      ),
    ],
  },
  {
    id: "reveal",
    label: "Delay, then disclose",
    principle:
      "Let Y supply information that changes how X is understood. The effect comes from the order of disclosure, not from a claim that X caused Y or that the reader must be surprised.",
    question:
      "What does the reader learn only at Y, and does withholding it help rather than mislead?",
    connectors: [
      connector(
        "reveal-it-turned-out",
        "it turned out",
        ["conversational"],
        "Frames Y as a later discovery; use only when discovery actually occurred, not just to manufacture surprise.",
      ),
      connector(
        "reveal-only-later",
        "only later",
        ["any"],
        "Delays knowledge or an event in time. The following clause must say what was learned or happened; lateness alone is not a revelation.",
      ),
      connector(
        "reveal-subsequent-review",
        "subsequent review showed",
        ["formal", "technical"],
        "Attributes a finding to a later review. It is appropriate only if the writer actually has such a review and its evidence.",
      ),
      connector(
        "reveal-the-catch",
        "the catch is",
        ["conversational", "sharp"],
        "Introduces a previously unmentioned drawback; it implies the first impression was incomplete, not necessarily false.",
      ),
    ],
    scaffolds: [
      scaffold(
        "reveal-disclosure",
        "[X].\n[Y].",
        ["any"],
        "Ordering and a pause can disclose the missing information without a theatrical announcement; Y must actually reframe X.",
      ),
      scaffold(
        "reveal-catch",
        "[X]. The catch is: [Y].",
        ["conversational", "sharp"],
        "Reveals a drawback after an initial impression. Do not use for a neutral detail.",
      ),
      scaffold(
        "reveal-review",
        "[X]. Subsequent review showed that [Y].",
        ["formal", "technical"],
        "Presents a later finding in an evidence-oriented voice; requires a real review and a supported finding supplied by the writer.",
      ),
    ],
  },
  {
    id: "compare",
    label: "Compare on a shared dimension",
    principle:
      "Align two things on a stated dimension to show similarity or difference. An analogy highlights selected features; it does not make the things identical or transfer every property.",
    question:
      "What common dimension makes this comparison informative, and where does it stop?",
    connectors: [
      connector(
        "compare-similarly",
        "similarly",
        ["any"],
        "Carries a specified feature across to a second case; the reader needs to know which feature is shared.",
      ),
      connector(
        "compare-like",
        "like",
        ["conversational"],
        "Usually introduces a noun phrase or analogy; a comparison is not proof that all characteristics carry across.",
      ),
      connector(
        "compare-by-comparison",
        "by comparison",
        ["formal", "technical"],
        "Invites evaluation against the first case without itself saying whether the second is better, worse, or similar.",
      ),
      connector(
        "compare-whereas",
        "whereas",
        ["formal", "technical"],
        "Aligns contrasting clauses on a shared dimension; it does not naturally introduce a similarity.",
      ),
    ],
    scaffolds: [
      scaffold(
        "compare-shared",
        "[X]. Similarly, [Y].",
        ["any"],
        "Invites the reader to track a shared feature between two complete claims.",
      ),
      scaffold(
        "compare-spoken",
        "[X]. It’s much the same with [Y].",
        ["conversational"],
        "Sets up an informal analogy. Y should name the other case, and the shared feature must be clear from context.",
      ),
      scaffold(
        "compare-difference",
        "[X], whereas [Y].",
        ["formal", "technical"],
        "Pairs comparable clauses to expose a difference rather than implying causation or defeated expectations.",
      ),
    ],
  },
  {
    id: "condition",
    label: "State a dependency or requirement",
    principle:
      "Make a claim depend on a stated circumstance. If X, then Y proposes sufficiency; Y only if X makes X necessary. Neither wording proves that X occurs, causes Y, or follows from observing Y.",
    question:
      "Is X sufficient, necessary, or merely a scenario—and what supports that conditional rule?",
    connectors: [
      connector(
        "condition-if",
        "if",
        ["any"],
        "Introduces an assumed condition, not an observed fact. If X then Y does not license inferring X from Y.",
      ),
      connector(
        "condition-only-if",
        "only if",
        ["formal", "technical"],
        "Marks a necessary condition: Y only if X requires X for Y, but does not promise that X alone produces Y.",
      ),
      connector(
        "condition-unless",
        "unless",
        ["conversational"],
        "Roughly means if not, setting a default with an exception. Negatives and multiple conditions can make its scope hard to follow.",
      ),
      connector(
        "condition-provided-that",
        "provided that",
        ["formal", "technical"],
        "Sets an explicit proviso for the claim or permission; it emphasizes the requirement, not evidence that it has been met.",
      ),
    ],
    scaffolds: [
      scaffold(
        "condition-sufficient",
        "If [X], then [Y].",
        ["any"],
        "Proposes X as sufficient for Y in the stated setting. This is a conditional claim, not proof of either slot or a causal mechanism.",
      ),
      scaffold(
        "condition-default",
        "[Y] unless [X].",
        ["conversational"],
        "States a default outcome with an excluding condition; verify the negation and do not treat it as identical to if X then Y.",
      ),
      scaffold(
        "condition-necessary",
        "[Y] only if [X].",
        ["formal", "technical"],
        "Makes X necessary for Y without asserting that it is sufficient. The reversed slot order is intentional.",
      ),
    ],
  },
  {
    id: "sequence",
    label: "Order events or steps",
    principle:
      "Place events, procedures, or ideas in an intelligible order. Before and after specify time; a numbered argument can specify reading order. Neither alone establishes cause.",
    question:
      "Am I describing time, procedural dependency, or just the order of presentation?",
    connectors: [
      connector(
        "sequence-then",
        "then",
        ["any"],
        "Usually marks the next point in time or procedure, but can mean a conditional consequence in if–then constructions.",
      ),
      connector(
        "sequence-and-then",
        "and then",
        ["conversational"],
        "Links narrated steps with a spoken rhythm; repeating it can flatten important differences in pace or importance.",
      ),
      connector(
        "sequence-subsequently",
        "subsequently",
        ["formal", "technical"],
        "Specifies that something followed in time without itself attributing a cause.",
      ),
      connector(
        "sequence-meanwhile",
        "meanwhile",
        ["any"],
        "Marks overlap in time or a concurrent thread, not the next step; it is not interchangeable with then.",
      ),
    ],
    scaffolds: [
      scaffold(
        "sequence-next",
        "[X]. Then [Y].",
        ["any"],
        "Makes the order explicit while leaving causation unclaimed.",
      ),
      scaffold(
        "sequence-story",
        "[X], and then [Y].",
        ["conversational"],
        "Keeps two narrated steps in one flowing sentence without claiming that the first caused the second.",
      ),
      scaffold(
        "sequence-record",
        "[X]. Subsequently, [Y].",
        ["formal", "technical"],
        "Records temporal succession in a report-like voice without claiming a mechanism.",
      ),
    ],
  },
  {
    id: "exception",
    label: "Carve out an exception",
    principle:
      "Preserve a generalization while identifying the cases or circumstances it excludes. If exceptions overwhelm the rule, revise the rule rather than hide them in a small aside.",
    question:
      "Exactly what does Y exclude, and does X remain accurate after that exclusion?",
    connectors: [
      connector(
        "exception-except-that",
        "except that",
        ["any"],
        "Introduces a clause identifying an excluded fact or limiting circumstance, not a wholesale opposing assertion.",
      ),
      connector(
        "exception-apart-from",
        "apart from",
        ["conversational"],
        "Usually takes a noun phrase. It can mean excluding or in addition to, so check that the intended reading is clear.",
      ),
      connector(
        "exception-with-the-exception-of",
        "with the exception of",
        ["formal", "technical"],
        "Explicitly excludes a named item or class, using a noun phrase; precise but cumbersome for a short conversational sentence.",
      ),
      connector(
        "exception-except-for",
        "except for",
        ["any"],
        "Excludes a noun phrase from a broader claim; it does not take a complete clause in the way except that does.",
      ),
    ],
    scaffolds: [
      scaffold(
        "exception-clause",
        "[X], except that [Y].",
        ["any"],
        "Attaches a specific clausal exception to the claim it limits.",
      ),
      scaffold(
        "exception-one",
        "[X]. There’s one exception: [Y].",
        ["conversational"],
        "Gives the exception its own sentence; use one only when it really is a single exception.",
      ),
      scaffold(
        "exception-class",
        "[X], with the exception of [Y].",
        ["formal", "technical"],
        "Names an excluded class precisely. Y must be a noun phrase rather than an arbitrary full thought.",
      ),
    ],
  },
  {
    id: "emphasis",
    label: "Give a point prominence",
    principle:
      "Direct attention through placement, repetition, or a deliberate signal. Emphasis changes salience, not the truth or evidential strength of the claim.",
    question:
      "What deserves to be remembered, and can structure carry the emphasis without exaggeration?",
    connectors: [
      connector(
        "emphasis-above-all",
        "above all",
        ["any"],
        "Ranks one consideration above the others; it makes a priority claim rather than simply turning up the volume.",
      ),
      connector(
        "emphasis-the-point-is",
        "the point is",
        ["conversational", "sharp"],
        "Announces the takeaway, but can sound dismissive if it sweeps aside relevant objections.",
      ),
      connector(
        "emphasis-notably",
        "notably",
        ["formal", "technical"],
        "Marks a detail as worthy of attention without necessarily ranking it first or calling it statistically significant.",
      ),
      connector(
        "emphasis-indeed",
        "indeed",
        ["formal"],
        "Can confirm or strengthen a previous assertion. It does not contribute independent evidence and can sound ceremonial in casual prose.",
      ),
    ],
    scaffolds: [
      scaffold(
        "emphasis-isolate",
        "[X].\n\n[Y].",
        ["any"],
        "A separate paragraph gives the final thought visual prominence; use sparingly so the break retains force.",
      ),
      scaffold(
        "emphasis-takeaway",
        "[X]. The point is: [Y].",
        ["conversational", "sharp"],
        "Names the intended takeaway without automatically making it better supported.",
      ),
      scaffold(
        "emphasis-detail",
        "[X]. Notably, [Y].",
        ["formal", "technical"],
        "Calls attention to an important detail while avoiding an unsupported claim of statistical significance.",
      ),
    ],
  },
];

export function getRelationship(id: RelationshipId): CompositionRelationship {
  const relationship = compositionKnowledge.find((item) => item.id === id);
  if (!relationship)
    throw new RangeError(`Unknown composition relationship: ${id}`);
  return relationship;
}
/** 'any' shows all options; a specific register includes neutral ('any') options. */
export function connectorsFor(
  id: RelationshipId,
  register: StructureRegister,
): Connector[] {
  return getRelationship(id).connectors.filter(
    (item) =>
      register === "any" ||
      item.registers.includes("any") ||
      item.registers.includes(register),
  );
}
export function scaffoldsFor(
  id: RelationshipId,
  register: StructureRegister,
): SentenceScaffold[] {
  return getRelationship(id).scaffolds.filter(
    (item) =>
      register === "any" ||
      item.registers.includes("any") ||
      item.registers.includes(register),
  );
}

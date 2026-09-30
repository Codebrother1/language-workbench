# Models and routing

A model is a tool you choose for a run, **not** the owner of your document. You can write and arrange sections without configuring one. With no OpenAI key, **Offline** offers deterministic conservative/plain examples for trying the workflow. These are limited fixtures, not live language intelligence, a general dictionary or web research. Offline whole-piece and Delivery observations are limited, and Offline cannot provide a semantic Technical Writing diagnosis.

**OpenAI Direct** is the current live provider. In the installed Mac app, open **Document actions → AI providers → OpenAI Direct → Add API key** to use your own key; no `.env` editing is needed. In the local browser development version, the backend reads a repository-root `.env` instead, not a key typed into the browser. Adding or removing a desktop key does not rewrite a model preference or switch an Offline route to a paid one. OpenRouter, Vercel AI Gateway and custom-provider entries are **not implemented**.

## Which model will a run use?

In the Inspector's model controls, **Run with** chooses a model for this target's Diagnose → Propose chain. You can also set a model on a section, set a default for that section's type, or choose task, document and application defaults in **AI providers**. The order is:

**one-off → section → section type → task → document → application**

The first choice in that order wins. A choice for this run overrides the section; a section choice overrides its type; a type choice overrides the task; a task overrides document; document overrides application. “Use inherited default” removes a narrower choice. The same rule applies to Word/Phrase tools (their task is `words`). For whole-piece analysis there is no section choice. A new diagnosis can start a new one-off route; saved runs retain the model they actually used. No model switches automatically because of your words or a failed request.

## Discovery, comparison and cost

**Refresh models** in AI providers explicitly asks OpenAI for its model list and records when it last refreshed. It is not a writing request or a guarantee that a model can do every task. **Enter model ID manually** checks the ID's text format and saves it without a rebuild; it does **not** check whether that model is compatible with writing tasks or available to your account. Before the first refresh, a manually added ID may appear as unverified. Refresh filters out IDs for unsupported workflows; a manual ID not found in the refreshed list stays saved but is marked **Unavailable**. A newly added ID absent from a refreshed list is unavailable until a later refresh lists it. A failed refresh keeps the previous catalog. Neither a manual entry nor a refreshed listing proves that a model supports every writing request. If a model or provider fails, the app reports an error; it does **not** run a different paid model or quietly substitute Offline.

**Test connection** is a separate, tiny real OpenAI request and may incur charges. A successful test does not promise every writing or research operation will work.

**Compare models** in the Inspector runs **2–4 configured, enabled models** against the same target and context. It must include the model pinned to the current chain. Each live result may incur a charge. Successful candidates stay in separate model-labelled runs and [Takes](takes.md); a failed model reports its error, and nothing is selected or activated for you.

When you explicitly run OpenAI assistance, the backend can send more than the selected sentence: your document context, brief, sources, history and relevant saved style/library material may travel with the request. Do not include material you are not allowed to send. Writing calls do not silently do web research; any Language Radar research is a separate explicit action. See [Desktop app](desktop-app.md) for key storage and [Troubleshooting](troubleshooting.md) for unavailable choices.

[Documentation home](index.md)

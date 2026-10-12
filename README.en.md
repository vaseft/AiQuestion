# AiQuestion — ask before you build

[![npm version](https://img.shields.io/npm/v/dsh-plugin-aiquestion.svg?color=blue)](https://www.npmjs.com/package/dsh-plugin-aiquestion)
[![license](https://img.shields.io/npm/l/dsh-plugin-aiquestion.svg)](LICENSE)

[中文](README.md) | **English**

> A DSH (DeepSeek Harness) plugin. When you throw a vague sentence at your AI,
> it **does not start building**. It asks you questions first, forces you to be
> precise — and **adjudicates your answers with its own judgement**, deciding
> whether they are reasonable and actually informative. Only once it truly
> understands what you want does it get to work.

It exists to cure two diseases (only half-jokingly):

- **vibe code** — “I can't explain it, just write something and I'll tweak it.”
- **wish code** — “Give me an awesome app that does everything.”

Both end the same way: the AI burns tens of thousands of tokens, ships something
you did not want, and you start over. AiQuestion takes a clear stance:
**every token spent on a misunderstanding is wasted.**

---

## How it works

Every user turn is intercepted in the `agent/pre-step` waterfall **before** the
model request:

```
user sends an instruction
  ├─ plugin disabled / mode=never? ────── pass through (zero cost)
  ├─ waiting for your answer to a previous question?
  │     ├─ side request adjudicates: is your answer reasonable / informative?
  │     │     ├─ intent is sufficient OR round limit reached → emit 【Intent Contract】, release the model
  │     │     └─ otherwise → write the AI's follow-up question, reject this turn (main model never called)
  └─ new request → side request evaluates: sufficient intent? estimated workload?
        ├─ clear and below threshold → pass through (zero interference)
        └─ otherwise → generate 1-4 clarifying questions, write them, reject this turn (main model never called)
```

The key point: **the main model is never called during clarification.** All
evaluation and adjudication use a tiny, **history-free** side request whose
result is parsed by the plugin. The main model only gets the turn once the
intent is genuinely clear.

### AI-first adjudication

The adjudication prompt explicitly grants the AI priority over your casual answer:

- If your answer is **technically wrong, self-contradictory, or infeasible** →
  judged *unreasonable*, **not adopted**.
- If your answer merely repeats the question, or is a brush-off
  (**“whatever / you decide / either is fine”**) → judged **uninformative**,
  **not adopted**.
- The AI proceeds with **its own best solution** and records the decisions it
  made for you inside the **Intent Contract**.
- Follow-ups are capped (default 2 rounds). After that the AI **decides and
  builds**, rather than asking forever.

In short: it asks to understand you, but it will not obey you unless you are right.

---

## Real token savings (in the spirit of [dsh-ops](https://github.com/T-Auto/dsh-ops))

AiQuestion does not save tokens by talking less — it saves them by **not burning
tokens on misunderstandings**:

| Mechanism | Effect |
| --- | --- |
| All evaluation/adjudication use **history-free side requests** | **0 main-model calls** during clarification |
| **Ask once, avoid rework** | Saves the whole wrong-direction generation; far exceeds the side-request cost |
| Clear, small requests **pass through** | Chat and small edits see **zero interference and zero overhead** |
| `workloadThreshold` gate | Clarify only when estimated workload ≥ threshold (default 6/10) |
| **No tools published, no prompt injected by default** | **Zero fixed token cost** to the main model |
| Disabled / `mode=never` | Full bypass, **zero cost** |

---

## Install

AiQuestion is a standard DSH plugin: `package.json`'s `dsh.bundle.patch` points at
`cordis.patch.yml`, and the bundle entry's `name` **is the npm package name**. Any standard
DSH plugin-install entry accepts that name directly:

```
dsh-plugin-aiquestion
```

### Option 1 — paste the npm name in DSH / NewMax (recommended)

Enter `dsh-plugin-aiquestion` in the host's plugin-install field. The installer pulls the
package from npm and records it in the profile's `dsh.profile.bundles`; restart to load it.
No clone, no local path.

> ✅ The package **is published on npm**: `dsh-plugin-aiquestion@1.0.0` (MIT)
> — <https://www.npmjs.com/package/dsh-plugin-aiquestion>
>
> The repo ships a release helper (`npm run release`: preflight → login check → publish) —
> see "Publishing to npm" below.

### Option 2 — command line

```sh
dsh plugin --profile web add dsh-plugin-aiquestion
```

### Option 3 — local link (development)

```sh
dsh plugin --profile web add link:E:/dsh/dsh/AiQuestion
```

### Desktop (NewMax / DeepSeek Harness Desktop)

If the desktop build ships a standalone CLI, the generic layout is
`<install>/resources/runtime/cli/bin/dsh.cmd`:

```sh
"<install>/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add dsh-plugin-aiquestion
```

> ⚠️ That path follows the **generic** desktop layout and **not every distribution ships
> a standalone CLI** — packaged NewMax, for instance, usually exposes no `dsh` executable
> (verified on the author's machine: the path does not exist; `~/.newmax/bin` holds only
> `claude.exe`). If so, use Option 1 or the manual install below.

Restart the corresponding `dsh` process afterwards.

### Manual install (no `dsh` CLI)

Edit the target profile at `$DSH_HOME/profiles/<profile>/`:

1. Register the dependency and bundle in `package.json` (**release build, resolved from npm**):

   ```json
   {
     "dependencies": { "dsh-plugin-aiquestion": "^1.0.0" },
     "dsh": { "profile": { "bundles": ["dsh-plugin-aiquestion"] } }
   }
   ```

   > When developing the plugin **locally**, point it at your working copy instead:
   > `"dsh-plugin-aiquestion": "link:E:/dsh/dsh/AiQuestion"` (use your own path).

2. Or mount it directly in that directory's `cordis.patch.yml`:

   ```yaml
   - insert:
       - id: dsh-plugin-aiquestion
         name: dsh-plugin-aiquestion
   ```

3. Install dependencies with the profile's package manager (a `pnpm-lock.yaml` ships
   in the directory; typically `pnpm install`), then restart the host app.

> Manual steps vary by distribution; this project has **not** been validated
> end-to-end on packaged NewMax.

> The side request needs an OpenAI-compatible endpoint. Defaults to
> `https://api.deepseek.com` + `deepseek-chat`, with the key read from the DSH
> credential service (`DEEPSEEK_API_KEY`) or the same-named env var. Configurable
> via `provider`. If the host exposes a usable LLM service, it is preferred.

---

## Usage

1. A **draggable gear** sits in the bottom-right of the web UI — click to open settings.
2. Give the AI something vague (“make me a fun little tool”) and watch it bounce questions back.
3. Answer it. If you brush it off, it will **follow up anyway** or **decide for you**.

Settings (persisted to `$DSH_HOME/dsh-plugin-aiquestion/config.json`, applied instantly):
enable toggle, trigger mode (`auto` / `always` / `never`), workload threshold,
max follow-up rounds, question style (engineer / sassy / mentor), and a status preview.

---

## Custom question lines

Edit `$DSH_HOME/talking/*.txt` (seeded from the package on first run; one line per
entry). No need to touch `node_modules`.

---

## ⚠️ Session event contract

Like [AIQuit](https://github.com/Jia-HuaWu/AIQuit), AiQuestion writes an
**assistant/message** when it rejects a turn. That event must satisfy the DSH
session contract byte-for-byte: numeric `turn`/`step` wrapped by `step/start`,
`message.content` as an array, a mandatory `stream` array, and the official
`{ kind: 'reject' }` decision. The plugin validates the full shape before writing
and **fails open** if anything is off — *better to not clarify than to corrupt the
session*. These constraints come from lessons documented by the AIQuit author
(see [NOTICE](NOTICE)).

---

## Develop / test

```sh
node test/run.mjs        # or: npm test
```

---

## Publishing to npm (maintainers)

`release.mjs` does three things: **preflight → login check → publish to the official registry**.

```sh
npm run release
```

- **Preflight** verifies the package name, the file `dsh.bundle.patch` points to, that the
  `cordis.patch.yml` entry `name` equals the package name (a mismatch makes the market report
  "no bundle patch"), the `main` entry and the `files` list, then runs the unit tests.
  Preflight only: `npm run preflight`.
- **Official registry**: if your `~/.npmrc` points at `registry.npmmirror.com` (a read-only
  mirror), publishing cannot succeed; the script pins `https://registry.npmjs.org/` for you.
- **Not logged in**: the script prints step-by-step instructions (sign up → `npm login` →
  re-run) instead of a bare `ENEEDAUTH`.

Once published, anyone can install it by typing `dsh-plugin-aiquestion` into a DSH
plugin-install field.

> The package is **live on npm now**: `dsh-plugin-aiquestion@1.0.0`
> (verify with `npm view dsh-plugin-aiquestion version`). To ship a new version, bump
> `version` in `package.json` and re-run `npm run release`.

---

## Credits

An **original implementation**, designed after studying two open-source DSH plugins:

- **[AIQuit](https://github.com/Jia-HuaWu/AIQuit)** by [**Jia-HuaWu**](https://github.com/Jia-HuaWu) (MIT) — the *programmatic adjudication* pattern (`agent/pre-step` interception, tiny history-free side request, contract-compliant turn rejection with zero main-model calls), its hard-won session-event-contract lessons, and the draggable-gear settings panel. AIQuit is this project's inverse: it refuses work; AiQuestion clarifies before work.
- **[dsh-ops](https://github.com/T-Auto/dsh-ops)** by [**T-Auto**](https://github.com/T-Auto) (MIT AND Apache-2.0) — the token-efficiency philosophy (component toggles, zero fixed-cost prompt baseline, cheap side requests, "real" savings via avoiding rework) and the DSH packaging layout.

See [NOTICE](NOTICE). No source was copied verbatim; keep this NOTICE when redistributing.

## License

[MIT](LICENSE) © 2026 vaseft (AiQuestion contributors)

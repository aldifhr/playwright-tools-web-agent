# FarayAgent — Playwright QA Browser Agent

FarayAgent is a QA-focused AI chat application that controls a real Chromium browser through Playwright. It can explore websites, create QA test-plan documents, save structured test cases, run Playwright specs, collect screenshots, and explain grounded results in English.

## Features

- Real-time browser exploration with SSE progress: `Planning` → `Browsing` → `Testing` → `Reporting`
- Human-in-the-loop: `browser_bash` pauses for explicit Approve/Deny in the chat UI before running
- QA-only agent scope with browser, test, memory, and delegation tools
- Test plan documents with ten sections: objective, scope, strategy, deliverables, environment, roles, schedule, risks, and approval
- Structured `.cases.json` test cases with area summaries and quality-gate metadata
- Playwright spec save and run support
- Screenshot evidence, tool timeline, artifact preview, and quality-gate reporting
- Collapsible Agent activity summaries based on actual browser actions
- Persistent chat sessions, drafts, memory, provider settings, and model selection
- Skills marketplace at `/skills`, backed by the `skills.sh` ecosystem
- English UI and agent responses

## Stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS
- Vercel AI SDK with OpenAI and Anthropic providers
- Playwright Chromium and `@playwright/test`
- Framer Motion and Lucide icons

## Getting Started

```bash
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`.

Configure the provider, API key, base URL, and model at `/settings`. Settings are stored in the browser's local storage. Browser-only Playwright checks do not require an LLM API key.

### Remote browser (optional)

Set `BROWSER_CDP_URL` to drive a shared Chromium instead of launching a local one:

```bash
# WebSocket endpoint (e.g. browserless, Bright Data) or http(s) CDP endpoint
BROWSER_CDP_URL="wss://example.com/playwright" npm run dev
```

If the variable is unset or the connection fails, the app falls back to local headless Chromium. Remote browsers are never killed — only the session context is closed.

Set `BRIGHTDATA_BROWSER_AUTH` (`zone username:password`) instead to use the Bright Data managed anti-bot browser without a CDP URL. Set `BROWSER_HEADLESS=false` to run the local browser headed for visual debugging.

## Routes

- `/` — landing page
- `/chat` — QA chat with a project switcher
- `/project/{projectId}` — chat locked to one project (Claude-style project URL)
- `/projects` — create, rename, and manage projects: scoped chats, custom instructions, knowledge files
- `/tests` — saved Playwright specs, run results, cases, and history
- `/settings` — provider, model, API key, base URL, and Chromium check
- `/memory` — manage durable facts stored in `MEMORY.md`
- `/logs` — inspect tool calls, inputs, outputs, durations, and errors
- `/prompt` — inspect the composed system prompt per section, with project-context preview
- `/skills` — search, install, and remove agent skills

## Chat Workflow

The chat supports:

- Multi-session history with automatic titles
- Draft persistence per session
- Text-file attachments and drag-and-drop for supported text formats
- Copy, edit, regenerate, retry, stop, and jump-to-latest controls
- Main-agent and sub-agent indicators
- Live activity summaries based on real tools and selectors
- Test plan and test-case artifact previews
- Screenshots with a lightbox viewer

For a QA test plan request, the agent explores only as much as needed, creates a Markdown test-plan document, runs a quality gate, and reports the saved artifact. Detailed test cases are stored separately as `.cases.json` when requested.

## Skills

FarayAgent supports two skill sources:

### `.skills/`

Skills installed from the in-app `/skills` page. The page searches `skills.sh`, shows install counts and source links, and stores selected `SKILL.md` files locally.

### `.agents/skills/`

Skills installed with the `npx skills add` CLI for OpenCode and other agent ecosystems. Only audited, allowlisted skills are loaded by FarayAgent:

- `playwright-best-practices`
- `playwright-explore-website`
- `playwright-stealth-verify`
- `senior-qa-engineer`

Installed skills are treated as untrusted reference instructions. They cannot add tools, grant permissions, override the system prompt, or bypass QA and security rules. High-risk skills are not loaded automatically.

Example installation:

```bash
npx skills add https://github.com/currents-dev/playwright-best-practices-skill --skill playwright-best-practices --agent opencode --yes
```

Review every external skill and its security assessment before enabling it. A Vercel OIDC token is not required for local skills usage; the app falls back to a curated catalog and GitHub `SKILL.md` retrieval when the public `skills.sh` API returns `401`.

## Memory

`MEMORY.md` is loaded into the system prompt on every request. It is intended for durable preferences, public demo-site facts, important URLs, and robust locators. Passwords, API keys, tokens, and real secrets are rejected automatically.

## API

- `POST /api/chat/stream` — SSE chat stream with status, screenshot, artifact, approval, done, aborted, and error events
- `POST /api/chat/cancel` — cancel an active run
- `POST /api/chat/approve` — resolve a pending tool approval (`{ runId, id, approved }`)
- `POST /api/models` — load live models from a configured provider
- `GET|POST /api/browser` — manual browser control
- `GET|POST /api/memory` — list, save, and forget memory facts
- `GET|POST /api/logs` — read and clear tool logs
- `GET|POST /api/skills` — search, install, and remove skills
- `GET|POST /api/tests` — list, read, delete, and run Playwright specs

## Project Structure

```text
SOUL.md, MEMORY.md             Agent personality and durable memory
src/app/page.tsx               Landing page
src/app/chat/page.tsx          Chat route
src/app/projects/page.tsx      Scoped chat projects
src/app/tests/page.tsx         Spec list, run results, cases, history
src/app/settings/page.tsx      Provider and browser settings
src/app/memory/page.tsx        Memory management
src/app/logs/page.tsx          Tool-log viewer
src/app/skills/page.tsx        skills.sh skill manager
src/app/api/                   Chat, browser, memory, logs, skills, and test APIs
src/components/Chat.tsx        Chat UI, stream reader, artifacts, and activity
src/lib/agent.ts               AI tools and test-plan schemas
src/lib/providers.ts            Providers and the English QA system prompt
src/lib/skills.ts               skills.sh client and local skill loader
src/lib/specs.ts               Spec, test-case, artifact, and quality-gate storage
src/lib/soul.ts                 Prompt composition for soul, rules, memory, and skills
tests/                          Playwright specs and generated test-case artifacts
```

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

The build may report existing Turbopack warnings for dynamic filesystem access used by the browser sandbox and artifact routes.

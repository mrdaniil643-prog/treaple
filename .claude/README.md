# Claude Code configuration

## Plugins

`settings.json` declares the `claude-code-skills` marketplace
(`alirezarezvani/claude-skills`) and enables **all 99 plugins** it publishes. Any
session that clones this repo picks them up automatically — no manual
`/plugin install` needed.

To set the same thing up by hand:

```
/plugin marketplace add alirezarezvani/claude-skills
/plugin install engineering-skills@claude-code-skills
```

### Cost of enabling everything

Every enabled plugin contributes its skill descriptions to the system prompt at
session start. At 99 plugins that is hundreds of skills, which measurably inflates
the prompt and slows startup. To trim back, delete entries from `enabledPlugins` —
removal is just a JSON edit, the plugins stay installed.

Two plugins are worth a second look before keeping them on:

- `security-guidance` installs a `PreToolUse` hook that fires on **every** Edit/Write
  and flags 12 security anti-patterns. It is the only enabled plugin that intercepts
  tool calls.
- `skillopt-sleep` is built for nightly self-evolution of its own source repo, not
  for arbitrary projects.

### Names that moved

Three names in the upstream README no longer resolve as standalone plugins:

- `playwright-pro` → published as `pw`
- `skill-security-auditor` → a skill inside `engineering-skills`
- `content-creator` → a skill inside `marketing-skills`

Skill counts in the upstream README are lower than what ships today; the table below
reflects the current manifest.

### Enabled plugins

| Plugin | Description |
| --- | --- |
| `marketing-skills` | 47 marketing skills across 8 pods: Content, SEO & AEO, CRO, Channels, Growth, Intelligence, Sal |
| `c-level-skills` | 33 C-level advisory skills (install the separate companion c-level-agents plugin for the person |
| `c-level-agents` | Founder-mode executive team plugin: 13 cs-* C-suite agents (CFO, CMO, CRO, CPO, COO, CHRO, CISO |
| `general-counsel-advisor` | General Counsel advisory for startups: contract risk scanner (12 founder-killer patterns: auto- |
| `arquiteto-de-empresa` | Company Architect: builds a business from scratch as an OKF (Open Knowledge Format) bundle — a  |
| `chief-data-officer-advisor` | Chief Data Officer advisory for startups: AI training data audit (origin × class × use-case mat |
| `vpe-advisor` | VP of Engineering advisory: delivery throughput analyzer (DORA 4 metrics + cycle-time bottlenec |
| `chief-customer-officer-advisor` | Chief Customer Officer advisory: retention decomposition analyzer (honest GRR vs NRR; 7-categor |
| `chief-ai-officer-advisor` | Chief AI Officer advisory for startups: model build-vs-buy calculator (API vs fine-tune vs buil |
| `engineering-advanced-skills` | 37 advanced engineering skills: agent designer, agent workflow designer, RAG architect, databas |
| `engineering-skills` | 32 engineering skills: architecture, frontend, backend, fullstack, QA, DevOps, security, AI/ML, |
| `ra-qm-skills` | 14 regulatory affairs & quality management skills for HealthTech/MedTech: ISO 13485 QMS, MDR 20 |
| `product-skills` | 13 bundled product skills with 22 Python tools: product-skills fork-orchestrator with continuou |
| `pm-skills` | 9 project management skills with 15 Python tools: pm-skills fork-orchestrator with agentic deli |
| `business-growth-skills` | 5 business & growth skills: customer success manager, sales engineer, revenue operations, contr |
| `finance-skills` | 3 finance skills: financial analyst (ratio analysis, DCF valuation, budgeting, forecasting), Sa |
| `pw` | Production-grade Playwright testing toolkit |
| `self-improving-agent` | Curate auto-memory, promote learnings to CLAUDE |
| `autoresearch-agent` | Autonomous experiment loop — optimize any file by a measurable metric |
| `google-workspace-cli` | Google Workspace administration via the gws CLI |
| `code-to-prd` | Reverse-engineer any codebase into a complete PRD |
| `agenthub` | Multi-agent collaboration — spawn N parallel subagents that compete on code optimization, conte |
| `a11y-audit` | WCAG 2 |
| `executive-mentor` | Adversarial thinking partner for founders and executives |
| `docker-development` | Docker and container development — Dockerfile optimization, docker-compose orchestration, multi |
| `helm-chart-builder` | Helm chart development — chart scaffolding, values design, template patterns, dependency manage |
| `terraform-patterns` | Terraform infrastructure-as-code — module design patterns, state management, provider configura |
| `research-summarizer` | Structured research summarization — summarize academic papers, market research, user interviews |
| `code-tour` | Create CodeTour  |
| `demo-video` | Create polished demo videos from screenshots and scene descriptions |
| `data-quality-auditor` | Audit datasets for completeness, consistency, accuracy, and validity |
| `statistical-analyst` | Hypothesis testing, A/B experiment analysis, sample size calculation, and confidence intervals |
| `apple-hig-expert` | Master Apple's Human Interface Guidelines (HIG) with focus on 2026 Liquid Glass aesthetics |
| `llm-wiki` | A second brain for Claude Code + Obsidian inspired by Karpathy's LLM Wiki gist |
| `karpathy-coder` | Active coding discipline enforcer based on Karpathy's 4 principles: surface assumptions, simpli |
| `feature-flags-architect` | End-to-end feature-flag discipline: classify, ship, ramp, retire |
| `kubernetes-operator` | End-to-end Kubernetes Operator discipline: CRD design, reconcile-loop patterns, and OperatorHub |
| `chaos-engineering` | End-to-end chaos engineering discipline: design experiments with hypothesis + steady-state metr |
| `slo-architect` | End-to-end SLO/SLI/error-budget discipline per Google SRE Workbook |
| `write-a-skill` | Skill-author skill: create new agent skills with proper structure, progressive disclosure, and  |
| `book-to-skill` | Converts books, documentation folders, and source collections (PDF, EPUB, DOCX, HTML, Markdown, |
| `workflow-builder` | Workflow-builder skill: design and write deterministic multi-agent workflow scripts ( |
| `caveman` | Ultra-compressed communication mode |
| `zero-hallucination-coder` | A disciplined coding pipeline that grounds code in verified structure before a line is written: |
| `agent-harness` | Turn any domain folder of skills into a bounded agentic loop: a manifest builder inventories a  |
| `memory-engineering` | Engineer an agent's forgetting, not just its remembering |
| `skill-doctor` | Grade an agent setup from real conversation history — a rebuild of warpdotdev/common-skills' sk |
| `grill-me` | Relentless plan-and-design interrogator |
| `handoff-engineering` | Conversation-handoff document generator |
| `agile-product-owner` | Agile product ownership for backlog management and sprint execution |
| `capture-skill` | Brain-dump-to-action workspace skill |
| `email-pair` | Email-workflow skill pair: inbox-setup builds your taxonomy/KB; inbox-triage classifies + draft |
| `reflect-skill` | Light-prompt reflection skill |
| `handoff-productivity` | Compact the current conversation into a handoff document for another agent to pick up |
| `andreessen` | Marc Andreessen-mode decision and productivity skill |
| `roast` | Pressure-test a business idea before you build it |
| `fable-goal` | Convert a rambling description of a desired outcome into one polished, autonomous /goal prompt  |
| `weekly-review` | GTD weekly-review loop |
| `deep-work` | Deep Work day planner |
| `meetings` | Meeting discipline |
| `swedish-mentor` | CEFR-leveled Swedish-learning mentor: two-question placement probe, listening-first learning pa |
| `landing` | Single-file HTML landing-page generator with 4 design styles, brand palette validation, GSAP an |
| `linkedin` | Organic LinkedIn presence, end to end, with LinkedIn's own rules enforced in code |
| `pulse` | Multi-source recency research |
| `deep-research` | Disciplined multi-source meta-research for high-stakes questions — the heavyweight alternative  |
| `litreview` | Academic literature orientation skill |
| `grants` | NIH grant-funding intelligence skill |
| `dossier` | Decision-grade entity research |
| `patent` | Patent prior-art + IP landscape skill |
| `syllabus` | Course supplementary-reading skill |
| `notebooklm` | Google NotebookLM browser-automation skill |
| `research-orchestrator` | Research orchestrator (hybrid router + fallback) |
| `deepread` | Evidence-first reading of supplied documents |
| `aeo` | Answer Engine Optimization (AEO) skill — optimize content to be cited by AI language models (Ch |
| `security-guidance` | PreToolUse security reminder hook for Claude Code |
| `skillopt-sleep` | Nightly offline self-evolution for this repo's Claude agent: harvests past Claude Code sessions |
| `business-operations-skills` | Internal BizOps domain |
| `commercial-skills` | Per-deal-and-packaging Commercial domain |
| `universal-scraping-architect` | A universal scraping skill with intelligent routing, token budget tracking, and quota awareness |
| `research-ops-skills` | Enterprise / cross-functional Research Operations domain — the managed counterpart to the acade |
| `markdown-html-skills` | Convert long markdown files into world-class single-file interactive HTML — DOMAIN COMPLETE at  |
| `youtube-full` | YouTube transcripts, video search, channel browsing, playlist extraction, and upload monitoring |
| `compliance-os` | Compliance OS — meta-orchestrator for multi-framework compliance programs spanning 9 frameworks |
| `snowflake-development` | Snowflake SQL, data pipelines (Dynamic Tables, Streams+Tasks), Cortex AI functions, Snowpark Py |
| `behuman` | Self-Mirror consciousness loop for human-like AI responses |
| `claude-coach` | Personal Claude power-user coach |
| `grill-with-docs` | Docs-anchored grilling session — interrogates a plan against the project's existing language (C |
| `llm-cost-optimizer` | Cut LLM API spend via model routing, prompt caching, prompt compression, and per-feature cost o |
| `prompt-governance` | Manage prompts in production at scale: prompt versioning, A/B testing, prompt registries, regre |
| `business-investment-advisor` | Business investment analysis and capital allocation advisor |
| `video-content-strategist` | Video content strategy: video scripts, YouTube channel optimization and SEO, short-form video p |
| `compliance-team-eu-ai-act` | EU AI Act (Regulation (EU) 2024/1689) operational compliance specialist: AI system risk classif |
| `compliance-team-iso42001` | ISO/IEC 42001:2023 AI Management System (AIMS) specialist: AIMS gap analyzer (Clauses 4-10 cove |
| `collab-proof` | Assisted retrospective: after a session, calibrates what Claude contributed vs what the develop |
| `human-gate` | Human-verification gate for an agent loop: builds a single-file review page (the page itself ma |
| `agent-launcher-skills` | Build, launch, grade, and schedule Claude Managed Agents (CMA) in your own Anthropic account —  |
| `agent-memory` | A four-tier memory ladder for Claude Code where promotion is earned by recurrence, not asserted |
| `spinning-up-deep-rl` | Knowledge base compiled from OpenAI's Spinning Up in Deep RL (MIT, Joshua Achiam) by engineerin |
| `deep-learning-book` | Study companion for the Deep Learning textbook by Goodfellow, Bengio & Courville (MIT Press, 20 |

## Skills

`skills/` holds skills vendored directly into the repo, predating the marketplace
setup: `frontend-design`, `mcp-builder`, `stop-slop`, `theme-factory`,
`ui-ux-pro-max`, `web-artifacts-builder`, `webapp-testing`.

# Claude Code configuration

## Plugins

`settings.json` declares the `claude-code-skills` marketplace
(`alirezarezvani/claude-skills`) and enables 11 plugins from it. Any session that
clones this repo picks them up automatically — no manual `/plugin install` needed.

To set the same thing up by hand:

```
/plugin marketplace add alirezarezvani/claude-skills
/plugin install engineering-skills@claude-code-skills
```

### Enabled plugins

| Plugin | Contents (marketplace v2.9–2.11) |
| --- | --- |
| `engineering-skills` | 32 engineering skills — architecture, frontend, backend, fullstack, QA |
| `engineering-advanced-skills` | 37 advanced skills — agent designer, workflow designer |
| `product-skills` | 13 product skills, 22 Python tools |
| `marketing-skills` | 47 marketing skills across 8 pods, 62 Python tools |
| `ra-qm-skills` | 14 regulatory affairs & quality management skills |
| `pm-skills` | 9 project management skills, 15 Python tools |
| `c-level-skills` | 33 C-level advisory skills |
| `business-growth-skills` | 5 business & growth skills |
| `finance-skills` | 3 finance skills |
| `pw` | Playwright testing toolkit — 9 skills, 3 agents, 55 templates |
| `self-improving-agent` | Auto-memory curation, `/si:*` commands, 2 sub-agents |

### Renamed / relocated

Three names from the upstream README no longer resolve as standalone plugins:

- `playwright-pro` → published as `pw`
- `skill-security-auditor` → a skill inside `engineering-skills`
- `content-creator` → a skill inside `marketing-skills`

Skill counts in the upstream README are lower than what ships today; the table above
reflects the current manifest.

### Not installed

`c-level-agents` is a separate companion plugin to `c-level-skills` (13 `cs-*`
C-suite agents). `security-guidance` installs a `PreToolUse` hook that fires on every
Edit/Write. Both were left out — add them to `enabledPlugins` if wanted.

## Skills

`skills/` holds skills vendored directly into the repo, predating the marketplace
setup: `frontend-design`, `mcp-builder`, `stop-slop`, `theme-factory`,
`ui-ux-pro-max`, `web-artifacts-builder`, `webapp-testing`.

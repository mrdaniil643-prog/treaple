# Obsidian

The Obsidian vault is the private repo `mrdaniil643-prog/obsidian-vault`. A SessionStart hook
clones it into `~/obsidian-vault` (or pulls it if already there); on the user's computer the
Obsidian Git plugin syncs the same repo.

- Notes are plain Markdown; links are `[[wikilinks]]`, metadata goes in YAML frontmatter.
- Never edit `.obsidian/` unless asked.
- After changing notes: `git -C ~/obsidian-vault add -A && git -C ~/obsidian-vault commit -m "..." && git -C ~/obsidian-vault push`.
- If `~/obsidian-vault` is missing, the repo is not attached to the session: ask the user to add it.

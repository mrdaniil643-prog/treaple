# Obsidian

The Obsidian vault is the private repo `mrdaniil643-prog/obsidian-vault`. In cloud sessions it sits
next to this repo at `../obsidian-vault`; a SessionStart hook clones it there if the session did
not, or pulls it. On the user's phone the Obsidian Git plugin syncs the same repo.

- Notes are plain Markdown; links are `[[wikilinks]]`, metadata goes in YAML frontmatter.
- Never edit `.obsidian/` unless asked.
- After changing notes: `git -C ../obsidian-vault add -A && git -C ../obsidian-vault commit -m "..." && git -C ../obsidian-vault push`.
- If `../obsidian-vault` is missing, the repo is not attached to the session: ask the user to add it.

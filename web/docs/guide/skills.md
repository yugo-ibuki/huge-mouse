# Slash Commands & Skills

## Slash Commands

Type `/` in the input area to open the autocomplete menu. Custom commands can be defined and are saved automatically.

## Skill Commands

unitmux automatically loads skill files from:

- `~/.claude/skills/` (user skills)
- `<project>/.claude/skills/` (project skills)

Each skill directory must contain a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: my-skill
description: Description of the skill
---
```

Skill commands appear in the slash command autocomplete alongside custom commands.

## Navigation

| Key | Action |
| --- | --- |
| `/` + type | Filter commands |
| `↑` / `↓` | Navigate list |
| `Enter` / `Tab` | Select command |
| `Escape` | Close menu |

# Shared Skill Fragments

This directory holds reference fragments used by multiple skills in this plugin. It is **not a skill** — there is no `SKILL.md` here, so Claude Code will not load it as a skill.

Files here are referenced explicitly from other skills with `Read` instructions (e.g., `Read ../_shared/SYSTEMD_HARDENING.md and apply...`). This lets shared, rarely-changing fragments live in one place without duplicating content into every skill body.

## Contents

| File | Used by | Purpose |
|------|---------|---------|
| `DIAG_SETUP.md` | `deploying-hy2-nodes`, `deploying-xray-nodes`, `testing-nodes` | Install diagnostic dependencies and the `tunpilot-diag` wrapper |
| `SYSTEMD_HARDENING.md` | `deploying-hy2-nodes`, `deploying-xray-nodes` | Parameterized systemd drop-in template for hardening a proxy service |
| `SSH_TROUBLESHOOTING.md` | `deploying-hy2-nodes`, `deploying-xray-nodes`, `testing-nodes` | Common SSH/systemd failure modes and fixes |

## Editing rules

- Do not add a `SKILL.md` here. Any file that matches a skill-detection pattern will pollute the skill registry.
- Keep fragments small and command-oriented. If a fragment grows past ~60 lines, reconsider whether it should be promoted to a proper skill.
- When editing a shared file, check every caller (grep `_shared/<filename>` across `skills/`) to ensure parameter contracts still hold.

# Diagnostics Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate output noise and execution blocking when running node diagnostics via SSH.

**Architecture:** A shell wrapper script (`tunpilot-diag`) deployed on each node filters third-party script output down to clean JSON. The testing-nodes skill is updated to use this wrapper and leverage background execution for non-blocking operation.

**Tech Stack:** Bash (wrapper script), Markdown (skill updates)

---

### Task 1: Create the `tunpilot-diag` wrapper script

**Files:**
- Create: `scripts/tunpilot-diag.sh`

**Step 1: Write the wrapper script**

Create `scripts/tunpilot-diag.sh`:

```bash
#!/usr/bin/env bash
# tunpilot-diag — Clean JSON output wrapper for IPQuality + NetQuality
# Deployed to /usr/local/bin/tunpilot-diag on proxy nodes
set -euo pipefail

VERSION="1.0.0"

if [[ "${1:-}" == "--version" ]]; then
  echo "tunpilot-diag $VERSION"
  exit 0
fi

# Extract balanced JSON object from raw output
# Reads stdin, prints the first complete top-level {...} object
extract_json() {
  awk '
    BEGIN { depth=0; found=0; json="" }
    {
      for (i=1; i<=length($0); i++) {
        c = substr($0, i, 1)
        if (c == "{") {
          if (depth == 0) found = 1
          depth++
        }
        if (found) json = json c
        if (c == "}") {
          depth--
          if (found && depth == 0) {
            print json
            exit
          }
        }
      }
      if (found) json = json "\n"
    }
  '
}

run_script() {
  local label="$1"
  local cmd="$2"
  local tmpfile
  tmpfile=$(mktemp /tmp/tunpilot-diag-XXXXXX.raw)
  trap "rm -f '$tmpfile'" RETURN

  echo >&2 "tunpilot-diag: running $label..."

  if ! TERM=dumb bash -c "$cmd" > "$tmpfile" 2>/dev/null; then
    local ec=$?
    # Script may exit non-zero but still produce JSON — try extraction
    local result
    result=$(extract_json < "$tmpfile")
    if [[ -n "$result" ]]; then
      echo "{\"type\":\"$label\",\"data\":$result}"
      return 0
    fi
    echo "{\"type\":\"$label\",\"error\":\"script failed\",\"exit_code\":$ec}"
    return 0
  fi

  local result
  result=$(extract_json < "$tmpfile")
  if [[ -n "$result" ]]; then
    echo "{\"type\":\"$label\",\"data\":$result}"
  else
    echo "{\"type\":\"$label\",\"error\":\"no JSON found in output\"}"
  fi
}

# --- Main ---
echo >&2 "tunpilot-diag v$VERSION — starting diagnostics"

run_script "ipquality" "curl -sL IP.Check.Place | bash -s -- -j -4"
run_script "netquality" "curl -sL Net.Check.Place | bash -s -- -j -4 -y"

echo >&2 "tunpilot-diag: done"
```

**Step 2: Make executable and verify syntax**

Run: `chmod +x scripts/tunpilot-diag.sh && bash -n scripts/tunpilot-diag.sh`
Expected: No output (syntax OK)

**Step 3: Commit**

```bash
git add scripts/tunpilot-diag.sh
git commit -m "feat: add tunpilot-diag wrapper for clean JSON diagnostics output"
```

---

### Task 2: Update deploying-nodes skill to install tunpilot-diag

**Files:**
- Modify: `skills/deploying-nodes/SKILL.md` (after line 144, before "### 2.4 TLS Certificate")

**Step 1: Add Phase 2.3.1 to deploying-nodes skill**

After the existing Phase 2.3 block (line 144), insert:

```markdown
### 2.3.1 Install Diagnostics Wrapper

Deploy the `tunpilot-diag` script for clean JSON diagnostics output:

\```bash
ssh <server> bash <<'DIAG_INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
DIAG_INSTALL
\```
```

**Step 2: Verify the edit looks correct**

Read `skills/deploying-nodes/SKILL.md` lines 136-160 to confirm the new section is properly placed.

**Step 3: Commit**

```bash
git add skills/deploying-nodes/SKILL.md
git commit -m "docs: add tunpilot-diag deployment step to deploying-nodes skill"
```

---

### Task 3: Update testing-nodes skill to use tunpilot-diag and background execution

**Files:**
- Modify: `skills/testing-nodes/SKILL.md`

This is the largest change. The updated Phase 2 replaces the raw SSH commands with `tunpilot-diag` and adds background execution guidance.

**Step 1: Rewrite Phase 2 in testing-nodes skill**

Replace the entire Phase 2 section (lines 34-63) with:

```markdown
## Phase 2: Run Diagnostics

For each target node, get `ssh_user`, `host`, and `ssh_port` from the `list_nodes` result.

### 2.0 Pre-flight Check

Verify `tunpilot-diag` is installed on each target node:

\```bash
ssh -p <ssh_port> <ssh_user>@<host> "tunpilot-diag --version"
\```

If the command fails (not found), install it:

\```bash
ssh -p <ssh_port> <ssh_user>@<host> bash <<'INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
INSTALL
\```

Also ensure diagnostic dependencies are installed:

\```bash
ssh -p <ssh_port> <ssh_user>@<host> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2 iperf3 mtr"
\```

### 2.1 Execute Diagnostics

Run the full diagnostics suite (IPQuality + NetQuality, ~5-7 min total):

\```bash
ssh -p <ssh_port> <ssh_user>@<host> "tunpilot-diag"
\```

Output is two JSON lines on stdout:
- Line 1: `{"type":"ipquality","data":{...}}`
- Line 2: `{"type":"netquality","data":{...}}`

If a check fails, the line will contain `"error"` instead of `"data"`.

### Execution Strategy

**Single node**: Run with `run_in_background` so the user is not blocked. Tell the user diagnostics are running and the approximate wait time (~5-7 min). The agent will be automatically notified when the command completes.

**Multiple nodes**: Launch each node's diagnostics in parallel using separate `run_in_background` Bash calls. Each node runs independently — no interference since they are different SSH sessions.

### Fallback (if tunpilot-diag is unavailable)

If `tunpilot-diag` cannot be installed (e.g., permission issues), fall back to raw script execution with output filtering:

\```bash
ssh -p <ssh_port> <ssh_user>@<host> "export TERM=dumb; bash <(curl -sL IP.Check.Place) -j -4" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' > /tmp/ipquality-<node>.txt
\```

Then extract JSON using Python:

\```python
python3 -c "
import json, sys
content = open('/tmp/ipquality-<node>.txt').read()
depth, start = 0, -1
for i, c in enumerate(content):
    if c == '{' and start == -1: start, depth = i, 1
    elif start >= 0:
        depth += (c == '{') - (c == '}')
        if depth == 0:
            data = json.loads(content[start:i+1])
            if 'Head' in data or 'Info' in data:
                print(json.dumps(data)); break
            start = -1
"
\```

Repeat for NetQuality with `Net.Check.Place` and `-j -4 -y` flags.
```

**Step 2: Verify the skill reads correctly**

Read the full updated skill to confirm structure and coherence.

**Step 3: Commit**

```bash
git add skills/testing-nodes/SKILL.md
git commit -m "docs: update testing-nodes skill to use tunpilot-diag with background execution"
```

---

### Task 4: Sync skills to plugin directory

**Files:**
- Copy: `skills/testing-nodes/SKILL.md` → `plugin/skills/testing-nodes/SKILL.md`
- Copy: `skills/deploying-nodes/SKILL.md` → `plugin/skills/deploying-nodes/SKILL.md`

**Step 1: Sync files**

```bash
cp skills/testing-nodes/SKILL.md plugin/skills/testing-nodes/SKILL.md
cp skills/deploying-nodes/SKILL.md plugin/skills/deploying-nodes/SKILL.md
```

**Step 2: Verify sync**

```bash
diff skills/testing-nodes/SKILL.md plugin/skills/testing-nodes/SKILL.md
diff skills/deploying-nodes/SKILL.md plugin/skills/deploying-nodes/SKILL.md
```

Expected: No diff output.

**Step 3: Commit**

```bash
git add plugin/skills/testing-nodes/SKILL.md plugin/skills/deploying-nodes/SKILL.md
git commit -m "chore: sync updated skills to plugin directory"
```

---

### Task 5: Deploy tunpilot-diag to existing nodes

This is a runtime task, not a code change. Deploy to both existing nodes.

**Step 1: Deploy to bwg-us**

```bash
ssh -p 22 root@95.181.188.250 bash <<'INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
INSTALL
```

**Step 2: Deploy to voyra-us**

```bash
ssh voyra bash <<'INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
INSTALL
```

Note: Script must be pushed to GitHub (Task 1 commit) before this step can run. Alternatively, use `scp` to push the local file directly:

```bash
scp scripts/tunpilot-diag.sh root@95.181.188.250:/usr/local/bin/tunpilot-diag
ssh root@95.181.188.250 "chmod +x /usr/local/bin/tunpilot-diag && tunpilot-diag --version"
```

**Step 3: Smoke test on one node**

```bash
ssh voyra "tunpilot-diag" 2>/dev/null | head -1 | python3 -m json.tool
```

Expected: Valid JSON with `{"type":"ipquality","data":{...}}`

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

  local ec=0
  TERM=dumb bash -c "$cmd" > "$tmpfile" 2>/dev/null || ec=$?

  local result
  result=$(extract_json < "$tmpfile")
  if [[ -n "$result" ]]; then
    echo "{\"type\":\"$label\",\"data\":$result}"
  elif [[ $ec -ne 0 ]]; then
    echo "{\"type\":\"$label\",\"error\":\"script failed\",\"exit_code\":$ec}"
  else
    echo "{\"type\":\"$label\",\"error\":\"no JSON found in output\",\"exit_code\":0}"
  fi
}

# --- Main ---
echo >&2 "tunpilot-diag v$VERSION — starting diagnostics"

run_script "ipquality" "curl -sL IP.Check.Place | bash -s -- -j -4"
run_script "netquality" "curl -sL Net.Check.Place | bash -s -- -j -4 -y"

echo >&2 "tunpilot-diag: done"

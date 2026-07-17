#!/usr/bin/env bash
# Branch lifecycle gates. Every gate is a command that exits 0 or refuses.
#
#   gate.sh work-to-integration <epic-id>
#   gate.sh integration-to-release <rc-tag>
#   gate.sh audit
#
# Branch names are NOT hardcoded. ARCHITECTURE.md declares them; this script reads
# them from git config, which the repo sets once:
#
#   git config branch.integration dev
#   git config branch.release     master
#
# Override the test command the same way, or via env:
#   git config gate.testcmd "<your test command>"   (required)
#
# Exit: 0 = gate passes, 1 = gate refuses, 2 = misconfigured

set -uo pipefail

die()  { printf '✗ %s\n' "$*" >&2; exit 1; }
conf() { printf '✗ %s\n' "$*" >&2; exit 2; }
ok()   { printf '  ok   %s\n' "$*"; }
bad()  { printf '  FAIL %s\n' "$*"; FAILED=1; }

INTEGRATION="${INTEGRATION:-$(git config branch.integration || true)}"
RELEASE="${RELEASE:-$(git config branch.release || true)}"
TEST_CMD="${TEST_CMD:-$(git config gate.testcmd || true)}"
EPIC_DIR="${EPIC_DIR:-epics}"

[ -n "$INTEGRATION" ] || conf "branch.integration not set. See header."
[ -n "$RELEASE" ]     || conf "branch.release not set. See header."
[ -n "$TEST_CMD" ]    || conf "gate.testcmd not set. See header."
git rev-parse --git-dir >/dev/null 2>&1 || conf "not a git repository"

FAILED=0

find_epic() {
  local id="$1" hit
  hit=$(find "$EPIC_DIR" -maxdepth 1 -iname "EPIC-${id}*.md" 2>/dev/null | head -1)
  [ -n "$hit" ] || die "no epic matching EPIC-${id} in ${EPIC_DIR}/"
  printf '%s' "$hit"
}

# Files a checklist item names, taken from `backticked/paths.ext`
epic_files() {
  sed -n '/^## 4\. Checklist/,/^## 5\./p' "$1" \
    | grep -o '`[^`]*\.[a-zA-Z0-9]\{1,5\}`' | tr -d '`' | sort -u
}

gate_work_to_integration() {
  local id="$1" epic; epic=$(find_epic "$id")
  printf 'Gate: work → %s   (epic: %s)\n' "$INTEGRATION" "$epic"

  # 1. every checklist item ticked
  if grep -qE '^\s*\[ \]' "$epic"; then
    bad "unchecked checklist items: $(grep -cE '^\s*\[ \]' "$epic")"
  else ok "checklist fully ticked"; fi

  # 2. full suite passes
  if eval "$TEST_CMD" >/tmp/gate_tests.log 2>&1; then ok "tests pass ($TEST_CMD)"
  else bad "tests fail — see /tmp/gate_tests.log"; fi

  # 3. closeout ran
  if grep -qiE '^\*\*Status:\*\* *closed\b' "$epic"; then ok "epic closed"
  else bad "epic-closeout has not run (Status is not exactly closed)"; fi

  # 4. rebased on / merged with integration
  if git merge-base --is-ancestor "$INTEGRATION" HEAD 2>/dev/null; then
    ok "up to date with $INTEGRATION"
  else bad "behind $INTEGRATION — rebase or merge first"; fi

  # 5. diff touches nothing the checklist did not name
  local declared changed stray
  declared=$(epic_files "$epic")
  changed=$(git diff --name-only "$INTEGRATION"...HEAD)
  if [ -z "$declared" ]; then
    bad "checklist names no files — cannot verify scope"
  else
    # The epic itself and the architecture document are expected to change:
    # ticking the checklist edits one, epic-closeout edits the other.
    stray=$(comm -23 <(printf '%s\n' "$changed" | sort -u) \
                     <(printf '%s\n' "$declared" | sort -u) \
            | grep -vE "^(${EPIC_DIR}/|ARCHITECTURE\.md$|architecture/)" || true)
    if [ -z "$stray" ]; then ok "diff within checklist scope"
    else bad "files changed but not named in checklist:"; printf '         %s\n' $stray; fi
  fi

  [ "$FAILED" -eq 0 ] || die "gate refused. Nothing was merged."
  printf '\n✓ gate passed. Merge, then delete the work branch immediately.\n'
}

gate_integration_to_release() {
  local tag="$1"
  printf 'Gate: %s → %s   (candidate: %s)\n' "$INTEGRATION" "$RELEASE" "$tag"

  git rev-parse -q --verify "refs/tags/$tag" >/dev/null \
    && ok "candidate tag exists" || bad "no such tag: $tag"

  local tag_sha head_sha
  tag_sha=$(git rev-list -n1 "$tag" 2>/dev/null || echo x)
  head_sha=$(git rev-parse "$INTEGRATION" 2>/dev/null || echo y)
  if [ "$tag_sha" = "$head_sha" ]; then ok "$INTEGRATION is the tested commit"
  else
    bad "$INTEGRATION has moved since $tag was built"
    printf '         %s commits landed. The tested artifact is not this one.\n' \
      "$(git rev-list --count "$tag".."$INTEGRATION" 2>/dev/null || echo '?')"
    printf '         Cut a new candidate.\n'
  fi

  # The human gate. A script must never assert this, and neither can a non-interactive
  # caller: the answer is read from the terminal, not from an env var or stdin.
  if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    printf 'Have you tested candidate %s yourself? [y/N] ' "$tag" > /dev/tty
    local answer=; IFS= read -r answer < /dev/tty || answer=
    case "$answer" in [yY]*) ok "candidate confirmed by user at the terminal" ;;
                      *)     bad "candidate not confirmed" ;; esac
  else
    bad "no terminal available — this gate requires a human at a tty"
  fi

  [ "$FAILED" -eq 0 ] || die "gate refused. Nothing was promoted."
  printf '\n✓ gate passed. Merge %s into %s.\n' "$INTEGRATION" "$RELEASE"
}

audit() {
  printf 'Stale branch audit (nothing will be deleted)\n\n'
  local del=0 ask=0
  while read -r br; do
    [ -n "$br" ] || continue
    case "$br" in "$INTEGRATION"|"$RELEASE") continue ;; esac

    if git merge-base --is-ancestor "$br" "$INTEGRATION" 2>/dev/null; then
      printf 'DELETE  %-42s merged into %s\n' "$br" "$INTEGRATION"; del=$((del+1)); continue
    fi

    case "$br" in
      epic/*)
        local id epic
        id=$(printf '%s' "$br" | sed -n 's|^epic/\([0-9]\{1,\}\).*|\1|p')
        epic=$(find "$EPIC_DIR" -maxdepth 1 -iname "EPIC-${id}*.md" 2>/dev/null | head -1)
        if [ -z "$epic" ]; then
          printf 'ASK     %-42s names EPIC-%s, which does not exist\n' "$br" "$id"; ask=$((ask+1))
        elif grep -qiE '^\*\*Status:\*\* *closed\b' "$epic"; then
          printf 'DELETE  %-42s epic closed, branch unmerged — verify then delete\n' "$br"; del=$((del+1))
        else
          printf 'keep    %-42s epic open\n' "$br"
        fi ;;
      fix/*)
        local last_rel age_ref
        last_rel=$(git rev-parse "$RELEASE" 2>/dev/null || true)
        if [ -n "$last_rel" ] && git merge-base --is-ancestor "$br" "$RELEASE" 2>/dev/null; then
          printf 'DELETE  %-42s merged into %s\n' "$br" "$RELEASE"; del=$((del+1))
        elif [ -n "$last_rel" ] && \
             [ "$(git rev-list --count "$br" --not "$RELEASE" 2>/dev/null || echo 0)" -gt 0 ] && \
             [ "$(git log -1 --format=%ct "$br")" -lt "$(git log -1 --format=%ct "$RELEASE")" ]; then
          printf 'REPORT  %-42s unmerged, older than the last release — your call\n' "$br"; ask=$((ask+1))
        else
          printf 'keep    %-42s unmerged direct slice\n' "$br"
        fi ;;
      *)     printf 'ASK     %-42s no epic id, no triage slug\n' "$br"; ask=$((ask+1)) ;;
    esac
  done < <(git for-each-ref --format='%(refname:short)' refs/heads/)

  printf '\n%d deletable, %d need a decision. Never delete an unmerged branch unprompted.\n' \
    "$del" "$ask"
}

case "${1:-}" in
  work-to-integration)    [ $# -eq 2 ] || die "usage: gate.sh work-to-integration <epic-id>"
                          gate_work_to_integration "$2" ;;
  integration-to-release) [ $# -eq 2 ] || die "usage: gate.sh integration-to-release <rc-tag>"
                          gate_integration_to_release "$2" ;;
  audit)                  audit ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

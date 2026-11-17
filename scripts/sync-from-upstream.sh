#!/usr/bin/env bash
# MrTiptop
# Merge upstream Snapcast into the current branch without overwriting Rezon8-owned files.
#
# Prefer this over GitHub's "Sync fork" button — that UI merge does not honor merge=ours
# and will replace README.md / Snapweb assets with upstream Snapcast versions.
#
# Usage:
#   ./scripts/sync-from-upstream.sh              # merge upstream/master
#   ./scripts/sync-from-upstream.sh develop      # merge upstream/develop
#   ./scripts/sync-from-upstream.sh --restore-only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Paths that must stay Rezon8-branded / fork-specific after an upstream sync.
PROTECTED_PATHS=(
  README.md
  doc/rezon8_mark.png
  doc/screenshots
  docker/snapcast-test
  docker-compose.snapcast-test.yml
  scripts
  .gitattributes
)

restore_protected() {
  local from_ref="$1"
  echo "Restoring Rezon8-protected paths from ${from_ref}..."
  local path
  for path in "${PROTECTED_PATHS[@]}"; do
    if git cat-file -e "${from_ref}:${path}" 2>/dev/null \
      || git ls-tree -d --name-only "${from_ref}" -- "${path}" | grep -q .; then
      git checkout "${from_ref}" -- "${path}"
      echo "  restored ${path}"
    else
      echo "  skip (missing on ${from_ref}): ${path}"
    fi
  done
}

if [[ "${1:-}" == "--restore-only" ]]; then
  # After an accidental GitHub Sync fork, restore from origin/<current-branch> tip before sync.
  # Pass REF=origin/UX ./scripts/sync-from-upstream.sh --restore-only
  restore_protected "${REF:-HEAD}"
  echo "Done. Review with: git status"
  exit 0
fi

UPSTREAM_REF="${1:-master}"
UPSTREAM_REMOTE="upstream"

if ! git remote get-url "${UPSTREAM_REMOTE}" >/dev/null 2>&1; then
  echo "Missing remote '${UPSTREAM_REMOTE}'. Add it with:"
  echo "  git remote add upstream https://github.com/badaix/snapcast.git"
  exit 1
fi

# Enable merge=ours for paths listed in .gitattributes (local to this repo only).
git config merge.ours.driver true

echo "Fetching ${UPSTREAM_REMOTE}..."
git fetch "${UPSTREAM_REMOTE}"

PRE_MERGE="$(git rev-parse HEAD)"
echo "Pre-merge HEAD: ${PRE_MERGE}"
echo "Merging ${UPSTREAM_REMOTE}/${UPSTREAM_REF}..."

# Allow empty message editor non-interactively.
if ! git merge --no-edit "${UPSTREAM_REMOTE}/${UPSTREAM_REF}"; then
  echo "Merge reported conflicts — restoring protected paths, then stop for manual resolve of the rest."
  restore_protected "${PRE_MERGE}"
  echo "Protected files restored from ${PRE_MERGE}."
  echo "Resolve remaining conflicts, then: git add -A && git commit"
  exit 1
fi

# Belt-and-suspenders: even when git auto-merged, force our fork copies back.
restore_protected "${PRE_MERGE}"
git add -- "${PROTECTED_PATHS[@]}"

if ! git diff --cached --quiet; then
  git commit -m "$(cat <<'EOF'
Restore Rezon8-protected paths after upstream sync.

EOF
)"
  echo "Created follow-up commit restoring protected Rezon8 paths."
else
  echo "Protected paths already matched pre-merge; no restore commit needed."
fi

echo "Upstream sync complete. Protected: ${PROTECTED_PATHS[*]}"

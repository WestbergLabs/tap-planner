#!/usr/bin/env bash
# Auto-merges an automation pull request when it is safe, else leaves it open
# and pings the owner. Called by the BrewPack workflows after they open or
# update their PR. Usage: scripts/automerge.sh <branch>
#
# Guard rails (any one holds the PR for a human):
#   - it touches anything outside data/ and public/brewpacks/
#   - it removes a file
#   - it drops more than MAX_REMOVED packs from the catalog
#   - it changes more than MAX_DATA_LINES lines of generated data
# The "Lint and build" check is required on main, and PRs opened with the
# workflow token do not trigger ci.yml, so this dispatches it on the branch
# first; GitHub's auto-merge then merges once it passes and deletes the branch.
#
# DRY_RUN=1 runs the guards on PR number $1 and prints the verdict only.
set -euo pipefail

OWNER_HANDLE="${OWNER_HANDLE:-4thehalibit}"
MAX_REMOVED="${MAX_REMOVED:-3}"
MAX_DATA_LINES="${MAX_DATA_LINES:-400}"
REPO="${GITHUB_REPOSITORY:-WestbergLabs/tap-planner}"

if [ "${DRY_RUN:-}" = 1 ]; then
  pr="$1"
  branch=""
else
  branch="$1"
  pr="$(gh pr list --head "$branch" --base main --state open --json number --jq '.[0].number // empty')"
  [ -n "$pr" ] || { echo "No open PR for $branch; nothing to merge."; exit 0; }
fi

hold() {
  echo "Holding PR #$pr: $1"
  if [ "${DRY_RUN:-}" != 1 ]; then
    gh pr comment "$pr" --body "@$OWNER_HANDLE auto-merge is on hold: $1. This pull request needs a human look."
  fi
  exit 0
}

meta="$(gh api "repos/$REPO/pulls/$pr" --jq '[.base.sha,.head.sha]|@tsv')"
base_sha="${meta%%$'\t'*}"
head_sha="${meta##*$'\t'}"

# Files and sizes.
data_lines=0
while IFS=$'\t' read -r name status adds dels; do
  case "$name" in
    data/*|public/brewpacks/*) ;;
    *) hold "it touches \`$name\`, outside data/ and public/brewpacks/" ;;
  esac
  [ "$status" != removed ] || hold "it removes \`$name\`"
  case "$name" in data/*.ts) data_lines=$((data_lines + adds + dels)) ;; esac
done < <(gh api --paginate "repos/$REPO/pulls/$pr/files" --jq '.[] | [.filename,.status,.additions,.deletions] | @tsv')
[ "$data_lines" -le "$MAX_DATA_LINES" ] || hold "it changes $data_lines lines of generated data (limit $MAX_DATA_LINES)"

# Pack count before and after.
packs() {
  gh api -H "Accept: application/vnd.github.raw" "repos/$REPO/contents/data/brewpacks.generated.ts?ref=$1" 2>/dev/null | grep -c '^    id: "' || true
}
before="$(packs "$base_sha")"
after="$(packs "$head_sha")"
if [ "$before" -gt 0 ] && [ $((before - after)) -gt "$MAX_REMOVED" ]; then
  hold "the catalog drops from $before to $after packs"
fi

echo "PR #$pr passes the guard rails ($before -> $after packs, $data_lines generated-data lines)."
[ "${DRY_RUN:-}" != 1 ] || exit 0

if ! gh workflow run ci.yml --ref "$branch" || ! gh pr merge "$pr" --auto --merge --delete-branch; then
  gh pr comment "$pr" --body "@$OWNER_HANDLE auto-merge could not be set up (CI dispatch or auto-merge failed; check that Allow auto-merge is enabled in the repo settings). Please merge by hand."
  exit 1
fi
echo "Auto-merge enabled for PR #$pr."

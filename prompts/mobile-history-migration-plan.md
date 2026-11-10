# Mobile history migration plan

## Goal

Replace the parent repository's `mobile` gitlink with a normal `mobile/` directory
while preserving the nested repository's committed history and current worktree
changes.

## Approved scope

- Commit the current tracked and untracked mobile changes in the nested repository.
- Import the nested repository history into the parent repository as a non-squashed
  subtree under `mobile/`.
- Replace the parent index's `mobile` gitlink with ordinary files.
- Remove the nested `mobile/.git` metadata only after verifying the imported history
  and mobile files in the parent repository.
- Do not push, modify unrelated files, or delete user-authored mobile content.

## Verification

- Confirm the parent repository records `mobile/` as ordinary files, not mode 160000.
- Confirm the imported mobile commit is reachable from the parent history.
- Confirm the approved mobile worktree changes are present in the imported tree.
- Run the existing server tests if shared project code is affected.

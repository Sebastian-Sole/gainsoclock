---
description: "Commit uncommitted changes and create a GitHub PR"
argument-hint: "<optional: base branch>"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
---

# Create Pull Request

Create a GitHub pull request for the current branch.

## Instructions

1. **Check for uncommitted changes**:
   - Run `git status` to see staged, unstaged, and untracked files.
   - If there are any uncommitted changes or untracked source files, stage and commit them with a descriptive conventional commit message.
   - Do NOT commit files that likely contain secrets (`.env`, credentials, tokens).

2. **Gather context**:
   - Determine the base branch: use `$1` if provided, otherwise `main`.
   - Run `git log <base>..HEAD --oneline` to see all commits on this branch.
   - Run `git diff <base>...HEAD --stat` to see a summary of all changed files.
   - Check for review comments: look for the most recent `.orchestration/*/review-comments.md` file.

3. **Push the branch**:
   - Run `git push -u origin HEAD`.

4. **Create the PR** using `gh pr create`:

   Use this exact body structure:

   ```
   ## What was done
   <Summarize what this branch accomplishes based on the commit history and diff. Be specific about features, fixes, or refactors. Use bullet points.>

   ## How to test
   <Step-by-step instructions for verifying the changes. Include:
   - Commands to run (build, test, lint)
   - Manual verification steps if applicable
   - Specific pages/flows to check>

   ## Remaining review comments
   <If a review-comments.md file exists in .orchestration/, summarize the unresolved comments here with severity and file references. If no review comments file exists, write "No outstanding review comments.">
   ```

   Use a HEREDOC for the body to preserve formatting:
   ```bash
   gh pr create --title "<title>" --base <base-branch> --body "$(cat <<'EOF'
   ...body...
   EOF
   )"
   ```

5. **Output the PR URL** when done.

## Rules

- Keep the PR title under 70 characters.
- The title should follow conventional commit style: `feat: ...`, `fix: ...`, `refactor: ...`.
- Never force-push or amend existing commits.
- If `gh` is not installed or not authenticated, stop and tell the user.

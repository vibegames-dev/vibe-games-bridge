---
name: co-review
description: Get a code review from Codex on uncommitted changes
allowed-tools: Bash, Read
---

Run Codex to review the changes you made. Use the output to improve your code.

## Steps

1. Run `codex review --uncommitted 2>&1 | tee /tmp/co-review.md` to get the review.
2. Read `/tmp/co-review.md`. The output includes streaming progress (`thinking`, `exec` blocks) — the actual review is the text after the final `codex` label. Extract just that final message.
3. Show the full review to the user verbatim in a code block, so they can verify it.
4. Read the review carefully. For each issue raised:
   - If you agree: fix it.
   - If you disagree: explain why you're skipping it.
5. After addressing all feedback, summarize what you changed and what you skipped.

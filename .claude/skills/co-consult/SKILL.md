---
name: co-consult
description: Ask Codex for a second opinion on hard architectural decisions, complex implementations, or tricky debugging. Only use when genuinely uncertain between approaches.
allowed-tools: Bash, Read, Grep, Glob
---

Ask Codex for a second opinion. Use this when you're genuinely uncertain — not for routine tasks.

## When to use
- Choosing between multiple valid architectural approaches
- Debugging something where the root cause is unclear
- Reviewing your own implementation for blind spots
- User explicitly asks via `/co-consult`

## Steps

1. Formulate a clear, self-contained question. Include:
   - What you're trying to do
   - The approaches you're considering (if applicable)
   - Relevant code snippets or file paths
2. Run `codex exec "$QUESTION" -o /tmp/co-consult.md > /dev/null 2>&1` to get the response.
3. Read `/tmp/co-consult.md` to get the response. If the file is empty, fall back to: `codex exec "$QUESTION" 2>&1 | tail -50` and extract the final message (after streaming progress lines).
4. Show the Codex response to the user verbatim in a code block.
5. Incorporate useful insights into your work. If you disagree with something, explain why.

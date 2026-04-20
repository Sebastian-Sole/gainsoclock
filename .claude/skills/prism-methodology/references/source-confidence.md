# Source Confidence System

Tag every finding with its source and freshness. The synthesizer uses these to weight findings and flag risks.

## Tags

| Tag | Meaning | When to Use |
|-----|---------|-------------|
| 🟢 **Verified** | Confirmed against a current, authoritative source | Official docs fetched and read, code verified in repo, API tested |
| 🟡 **Unverified** | Based on training data, not independently confirmed | Common knowledge not checked against current sources |
| 🔴 **Potentially Stale** | May have changed since training cutoff (May 2025) | Library versions, API behaviors, best practices, ecosystem tools |

## Format

```markdown
### Finding: [Title]

**Confidence**: 🟢 Verified
**Source**: [Source name, URL/path, date accessed]
**Details**: [The actual finding]
```

## Source Priority

1. **Local pinned docs** (node_modules/*/docs/, AGENTS.md) — highest confidence for project tech
2. **Official docs via web fetch** (verified, dated) — high confidence
3. **Project source code** (what actually exists) — high confidence
4. **Reputable technical sources via web search** (dated) — medium confidence
5. **Training data** (consistent with above) — baseline
6. **Training data contradicting verified sources** — flag immediately, investigate

## Staleness Check

Before exploring any technical topic, consider: "What aspects of this might have changed since mid-2025?" Verify those first. Rapidly evolving areas (frameworks, APIs, tools) need verification. Stable concepts (algorithms, design patterns, accessibility principles) are safer from training data.

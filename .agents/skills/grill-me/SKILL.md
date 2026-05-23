---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview the user relentlessly about every aspect of a plan or design until reaching shared understanding. Walk down the decision tree one unresolved decision at a time, resolving dependencies before moving forward.

If a question can be answered by exploring the codebase, explore the codebase instead.

Ask exactly one unresolved decision question per response. Do not bundle follow-up questions, implementation details, or adjacent decisions into the same response.

Use this fixed response structure for each decision:

```markdown
**Decision**
<One sentence naming the decision to resolve.>

**Recommendation**
<The recommended answer, stated directly.>

**Why**
<Brief rationale. Keep it focused on the current decision only.>

**Question**
<One clear question for the user to answer.>
```

Rules:

- Do not use numbered labels like "Question 7" unless the user explicitly asks for numbering.
- Do not put a description under a title that looks like the question; keep the heading labels exactly as shown.
- Do not introduce a second decision inside the recommendation or rationale.
- If the user's answer resolves the decision, briefly state the locked decision and then ask the next decision using the same structure.
- If the user expresses confusion, stop the decision flow and clarify the terms before asking another question.
- If the user's answer changes an earlier assumption, restate the updated decision tree before continuing.
- For codebase-specific designs, cite concrete files or existing types when useful, but keep the final question conceptual and answerable.
- Prefer concise explanations over exhaustive option lists. Include alternatives only when they materially change the decision.

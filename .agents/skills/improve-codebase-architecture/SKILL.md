---
name: improve-codebase-architecture
description: Find deepening opportunities in a codebase, informed by the domain language in CONTEXT.md and the decisions in docs/adr/. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and AI-navigable.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point. Do not drift into "component," "service," "API," or "boundary" when these words would obscure the architecture vocabulary.

- **Module**: anything with an interface and an implementation, such as a function, class, package, or slice.
- **Interface**: everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation**: the code inside.
- **Depth**: leverage at the interface: a lot of behaviour behind a small interface. **Deep** means high leverage. **Shallow** means the interface is nearly as complex as the implementation.
- **Seam**: where an interface lives; a place behaviour can be altered without editing in place. Use this, not "boundary."
- **Adapter**: a concrete thing satisfying an interface at a seam.
- **Leverage**: what callers get from depth.
- **Locality**: what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles:

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is informed by the project's domain model. The domain language gives names to good seams; ADRs record decisions the skill should not re-litigate.

## Process

### 1. Explore

Read the project's domain glossary and any ADRs in the area you're touching first. In this repository, also read `.tracker/decisions/` and relevant `.tracker/` notes when present.

Then explore the codebase. Do not follow rigid heuristics. Explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called, giving poor **locality**?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow. Would deleting it concentrate complexity, or just move it? "Yes, it concentrates" is the signal you want.

### 2. Present Candidates

Present candidates in the format the user requested. If the user did not request a specific format, create a concise markdown report in `.tracker/` for durable working notes instead of dropping conclusions only into chat.

For each candidate, include:

- **Files**: which files/modules are involved.
- **Problem**: why the current architecture is causing friction.
- **Solution**: plain English description of what would change.
- **Benefits**: explained in terms of locality and leverage, and how tests would improve.
- **Deletion test**: what happens if the suspected shallow module is removed.
- **Recommendation strength**: one of `Strong`, `Worth exploring`, or `Speculative`.

End with a **Top recommendation** section: which candidate to tackle first and why.

Use project domain vocabulary and the architecture vocabulary above. If a candidate contradicts an existing decision note or ADR, only surface it when the friction is real enough to warrant revisiting the decision. Mark the conflict clearly.

Do not propose full interfaces yet. After presenting candidates, ask which candidate the user wants to explore.

### 3. Grilling Loop

Once the user picks a candidate, walk the design tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, and what tests survive.

Use this fixed response structure for each unresolved decision:

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

Rules for the grilling loop:

- Ask exactly one unresolved decision question per response.
- Do not use numbered labels like "Question 7" unless the user explicitly asks for numbering.
- Do not put a description under a title that looks like the question; keep the heading labels exactly as shown.
- Do not introduce a second decision inside the recommendation or rationale.
- If the user's answer resolves the decision, briefly state the locked decision and then ask the next decision using the same structure.
- If the user expresses confusion, stop the decision flow and clarify the terms before asking another question.
- If the user's answer changes an earlier assumption, restate the updated decision tree before continuing.
- If a question can be answered by exploring the codebase, explore the codebase instead.
- Prefer concise explanations over exhaustive option lists. Include alternatives only when they materially change the decision.

Side effects happen inline as decisions crystallize:

- If naming a deepened module after a concept not represented in project vocabulary, offer to record the term in a durable note.
- If sharpening a fuzzy term during the conversation, update the relevant `.tracker/` note when the user agrees.
- If the user rejects a candidate with a load-bearing reason, offer to record the decision so future architecture reviews do not re-suggest it.
- Skip recording ephemeral reasons like "not worth it right now."

# Content Generation Pipeline

## How It Works

Background agents generate course content by researching TEKS standards and producing `course.json` files that validate against the Primer's content schema.

### Task Scope
Each task = **one module** within a grade-level course. An agent:
1. Researches the specific TEKS codes for that module
2. Defines Knowledge Components (KCs) with prerequisites
3. Creates 2-4 lessons with 3-5 problems each
4. Generates multi-step problems with progressive hints (scaffold → more specific → bottom out)
5. Validates output against `validateCourse()` from `@primer/shared`

### Task Queue
`content/content-queue.json` tracks all tasks with status, timing, and error info.

### Output
Each grade gets its own `content/tx-math-gN/course.json`. Agents write to a staging file first (`course.staging.json`), which gets reviewed and promoted to `course.json`.

### Quality Rules
- Every step needs at least 1 hint (preferably 3: scaffold, more_specific, bottom_out)
- Math notation uses `$...$` KaTeX syntax
- Problems need `acceptableFormats` for common answer variations
- Difficulty 1-5 per problem
- KC prerequisites must reference KCs defined in the same course
- No duplicate IDs across the entire course

### Running the Pipeline
From a Claude Code session:
```
# Launch a content generation agent for a specific module
Task(subagent_type="deep-researcher", prompt="Generate content for TX Math Grade 3, Module: Number and Operations...")
```

The agent writes to `content/tx-math-g3/course.staging.json` and reports results back.

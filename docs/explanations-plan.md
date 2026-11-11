# Plan: explain why an answer is right (and why mine was wrong)

## Goal
When I answer a choice question wrong (or press 不知道), the answer box shows:
- **Why:** one or two short sentences: why the right answer is right.
- **Your choice X:** one short sentence: why that option does not fit.

When I answer right, only **Why** is shown, small and muted.

## Scope: about 1,100 questions
| book | grammar drills | reading questions | workbook dialogs | workbook true/false |
|---|---|---|---|---|
| hsk1 | 62 | 60 | 45 | 43 |
| hsk2 | 70 | 60 | 60 | 60 |
| kouyu-rumen | 68 | 65 | 30 | 30 |
| ledu | 132 | 40 | 40 | 40 |

The workbook "reply" items and the generated quizzes (tones, pinyin, meanings) are not included: their answers explain themselves.

## Steps
### 1. Code (lead, Opus) – before the agents start
- `scripts/explain.mjs skeleton`: writes `data-src/explain/<book>-<part>.json`, one entry per question:
  `{ "key", "type", "lesson", "q", "options", "answer", "context", "why": "", "not": {} }`.
  `context` holds what the agent needs: the reading lines, dialog lines or the true/false text, and the grammar point.
  `key` is built from the question text and options, so it stays the same when lessons are re-imported.
- `scripts/explain.mjs build`: checks every file and writes `src/data/explain.gen.json` (`key → { why, not }`).
  It is part of `npm run gen:data`.
- `src/lib/explain.js`: loads the file on demand and returns `{ why, not }` for a question.
- `choiceQuiz` in `src/views/practice.js`: options keep their original index, so `answer()` knows which option was
  chosen. The reveal box adds Why / Your choice. One change covers grammar, reading, workbook and the practice test.
- Look: one muted line, the same font sizes as now, Chinese in `.hz`. No new colours. Fits the 春 / 漆 / 墨 / 宣纸 themes.
- Test: `npm test` checks that each key matches a real question and that every wrong option has a `not` reason.

### 2. Writers (8 Sonnet agents, in parallel) – one file each
| agent | file |
|---|---|
| 1 | `hsk1-grammar` |
| 2 | `hsk1-comprehension` (reading + dialog + true/false) |
| 3 | `hsk2-grammar` |
| 4 | `hsk2-comprehension` |
| 5 | `kouyu-rumen-grammar` |
| 6 | `kouyu-rumen-comprehension` |
| 7 | `ledu-grammar` |
| 8 | `ledu-comprehension` |

Each agent fills only `why` and `not` in its own file. It changes nothing else, and it does not touch other files.

### 3. Teacher (1 Opus agent) – checks everything
- Reads every entry: is the Chinese right? Is the rule right for this level? Does the reason really rule out that option?
- Fixes small mistakes directly. Writes larger problems to `data-src/explain/review.md`.
- Then `scripts/explain.mjs build`, `npm test`, `npm run check`.

### 4. Ship
Lead checks a few screens at iPhone and Windows sizes, opens a PR, and merges after the owner says yes.

## Rules for writers (the MD each agent gets)
- **Own words only.** Do not copy grammar notes or texts from the book. Do not open `data-src/private/`.
- **Simple English** (A2–B1), short: `why` ≤ 25 words, each `not` ≤ 15 words. Write Chinese in 汉字, with pinyin only when it helps.
- **Grammar:** name the rule, then apply it.
  Example: `几 asks about small numbers you can count, like people in a family.`
  `not.多`: `多 needs an adjective after it (多大, 多高); 多口人 is not Chinese.`
- **Reading and dialogs:** point to the line that gives the answer.
  Example: `B says 我家有三口人, so three.` `not.十八岁`: `She says 八岁, not 十八岁.`
- **True/false:** say what the text says and what the claim says.
  Example: `The text says 一个女儿; the claim says 两个, so it is false.`
- `not` has one entry for each wrong option, keyed by the option text exactly as written.
- If a question itself looks wrong (two possible answers, wrong key), still fill it in and add `"flag": "<reason>"`.
- Never invent rules. If unsure, keep it simple and true rather than detailed.

## Not changed
Lesson words, examples, readings and answers stay the same (progress keys depend on them). Nothing is added to Firestore.

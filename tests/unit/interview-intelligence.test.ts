import { describe, expect, it } from "vitest";

import { instructionFor, isConversationalRepair, staysOnTopic } from "@/lib/ai/live/intent-directives";
import {
  EMPTY_MEMORY,
  callbackFor,
  clarificationFor,
  findContradiction,
  markRecalled,
  recallSubject,
  recordEvidence,
  rememberAnswer,
  type InterviewMemory,
} from "@/lib/ai/live/memory";
import { isRepeatQuestion, normalizeQuestion } from "@/lib/ai/live/orchestrator";
import { deriveIntent, understandAnswer } from "@/lib/ai/live/understanding";

/**
 * Interviewer intelligence: the behaviours that separate an interviewer from a
 * question generator — remembering, noticing, probing, and being able to say
 * afterwards why it concluded what it did.
 */

const Q = "Which database would you choose and why?";

function answer(text: string, turn: number, atMs = turn * 60_000): {
  text: string;
  turn: number;
  atMs: number;
  understanding: ReturnType<typeof understandAnswer>;
} {
  return { text, turn, atMs, understanding: understandAnswer(text, Q) };
}

describe("semantic duplicate detection", () => {
  it("recognises a reworded question about the same concept", () => {
    // The stated requirement. As raw tokens these share nothing:
    // database/databases and indexing/indexes are distinct strings.
    const asked = [normalizeQuestion("What is database indexing?")];
    expect(isRepeatQuestion("Why do databases use indexes?", asked)).toBe(true);
  });

  it("folds singular and plural forms together", () => {
    const asked = [normalizeQuestion("How do you implement queues using an array?")];
    expect(isRepeatQuestion("How would you implement a queue using arrays?", asked)).toBe(
      true,
    );
  });

  it("folds verb forms together", () => {
    const asked = [normalizeQuestion("How does caching improve performance?")];
    expect(isRepeatQuestion("How do caches improve performance?", asked)).toBe(true);
  });

  it("still catches an exact repeat", () => {
    const asked = [normalizeQuestion("Explain how database indexing works")];
    expect(isRepeatQuestion("Explain how database indexing works?", asked)).toBe(true);
  });

  it("does not flag a different question on the same topic", () => {
    // "Indexing" and "transactions" are both databases, but they are not the
    // same question and collapsing them would silently drop coverage.
    const asked = [normalizeQuestion("What is database indexing?")];
    expect(isRepeatQuestion("How do database transactions guarantee atomicity?", asked)).toBe(
      false,
    );
  });

  it("does not flag an unrelated question", () => {
    const asked = [normalizeQuestion("What is database indexing?")];
    expect(
      isRepeatQuestion("Tell me about a time you disagreed with a colleague", asked),
    ).toBe(false);
  });

  it("is not fooled by shared question words alone", () => {
    // "What is X" vs "What is Y" share only filler, which must not count.
    const asked = [normalizeQuestion("What is a hash table?")];
    expect(isRepeatQuestion("What is a binary search tree?", asked)).toBe(false);
  });
});

describe("interview memory", () => {
  it("remembers a technology the candidate claimed to have used", () => {
    const memory = rememberAnswer(
      EMPTY_MEMORY,
      answer("We used Redis for session caching on that project.", 1),
    );
    const redis = memory.statements.find((s) => s.subject === "redis");
    expect(redis?.stance).toBe("USED");
    expect(redis?.quote).toContain("Redis");
  });

  it("records a denial as a denial", () => {
    const memory = rememberAnswer(
      EMPTY_MEMORY,
      answer("I have never used Kafka on a real project.", 1),
    );
    expect(memory.statements.find((s) => s.subject === "kafka")?.stance).toBe("NOT_USED");
  });

  it("only ever quotes words the candidate actually said", () => {
    const text = "We used Redis for session caching on that project.";
    const memory = rememberAnswer(EMPTY_MEMORY, answer(text, 1));
    for (const statement of memory.statements) {
      expect(text.toLowerCase()).toContain(
        statement.quote.replace(/…$/, "").toLowerCase().slice(0, 20),
      );
    }
  });

  it("offers an earlier subject to return to", () => {
    let memory: InterviewMemory = EMPTY_MEMORY;
    memory = rememberAnswer(memory, answer("We used Redis for caching.", 1));
    memory = rememberAnswer(memory, answer("The API was written in Node.js.", 2));

    const recalled = recallSubject(memory, { currentTurn: 4 });
    expect(recalled).not.toBeNull();
    expect(callbackFor(recalled!)).toContain(recalled!.subject);
    // The callback must quote them, not paraphrase.
    expect(callbackFor(recalled!)).toContain(recalled!.quote);
  });

  it("does not return to the same subject twice", () => {
    let memory: InterviewMemory = EMPTY_MEMORY;
    memory = rememberAnswer(memory, answer("We used Redis for caching.", 1));

    const first = recallSubject(memory, { currentTurn: 3 });
    expect(first?.subject).toBe("redis");

    memory = markRecalled(memory, "redis");
    expect(recallSubject(memory, { currentTurn: 3 })).toBeNull();
  });

  it("does not recall something said in the current turn", () => {
    const memory = rememberAnswer(EMPTY_MEMORY, answer("We used Redis.", 3));
    // Referring to "earlier" something they said one second ago is not memory.
    expect(recallSubject(memory, { currentTurn: 3 })).toBeNull();
  });

  it("has nothing to recall from an empty interview", () => {
    expect(recallSubject(EMPTY_MEMORY, { currentTurn: 5 })).toBeNull();
  });
});

describe("contradictions are clarified, never alleged", () => {
  it("notices a denial followed by a claim", () => {
    let memory: InterviewMemory = EMPTY_MEMORY;
    memory = rememberAnswer(memory, answer("I have never used Redis.", 1));
    memory = rememberAnswer(
      memory,
      answer("I implemented Redis caching in production for that service.", 3),
    );

    const contradiction = findContradiction(memory);
    expect(contradiction?.subject).toBe("redis");
    expect(contradiction?.earlier.turn).toBe(1);
    expect(contradiction?.later.turn).toBe(3);
  });

  it("asks for clarification without accusing", () => {
    let memory: InterviewMemory = EMPTY_MEMORY;
    memory = rememberAnswer(memory, answer("I have never used Redis.", 1));
    memory = rememberAnswer(memory, answer("I implemented Redis caching there.", 3));

    const text = clarificationFor(findContradiction(memory)!);
    expect(text).toMatch(/clarify/i);
    // Word-bounded on purpose: a bare /lie/ matches "Ear-lie-r", which is how
    // this assertion first failed against perfectly neutral wording.
    expect(text).not.toMatch(
      /\b(dishonest|lying|lied|lie|contradict\w*|inconsistent\w*|untrue)\b/i,
    );
    // Both of their own statements are quoted so nothing can be invented.
    expect(text).toContain("never used Redis");
    expect(text).toContain("implemented Redis caching");
  });

  it("does not flag a bare mention against a claim", () => {
    let memory: InterviewMemory = EMPTY_MEMORY;
    memory = rememberAnswer(memory, answer("The stack was Redis and Postgres.", 1));
    memory = rememberAnswer(memory, answer("I used Redis for the queue.", 2));
    expect(findContradiction(memory)).toBeNull();
  });

  it("does not flag both stances inside a single answer", () => {
    // "I hadn't used Redis before, so I used it here for the first time" is
    // one coherent sentence, not an inconsistency.
    const memory = rememberAnswer(
      EMPTY_MEMORY,
      answer("I had never used Redis before this, so I used Redis for the cache.", 1),
    );
    expect(findContradiction(memory)).toBeNull();
  });

  it("finds nothing in a consistent interview", () => {
    let memory: InterviewMemory = EMPTY_MEMORY;
    memory = rememberAnswer(memory, answer("I used Redis for caching.", 1));
    memory = rememberAnswer(memory, answer("Redis handled the session store too.", 2));
    expect(findContradiction(memory)).toBeNull();
  });
});

describe("evidence preservation", () => {
  const strong =
    "We chose PostgreSQL because we needed transactions across orders and payments. For example, a payment row without its order was silent data loss, and we saw that twice in staging. The trade-off was slower writes.";

  it("records what was observed, with the exchange attached", () => {
    const understanding = understandAnswer(strong, Q);
    const record = recordEvidence({
      turn: 2,
      atMs: 120_000,
      questionText: Q,
      answerText: strong,
      topicLabel: "Databases",
      intent: deriveIntent(understanding),
      understanding,
    });

    expect(record.questionText).toBe(Q);
    expect(record.answerText).toBe(strong);
    expect(record.strengths).toContain("explained their reasoning");
    expect(record.strengths).toContain("gave a concrete example");
    expect(record.strengths).toContain("acknowledged a trade-off");
  });

  it("records gaps for a thin answer", () => {
    const understanding = understandAnswer("Postgres.", Q);
    const record = recordEvidence({
      turn: 1,
      atMs: 0,
      questionText: Q,
      answerText: "Postgres.",
      topicLabel: "Databases",
      intent: deriveIntent(understanding),
      understanding,
    });
    expect(record.gaps.length).toBeGreaterThan(0);
    expect(record.strengths).not.toContain("gave a concrete example");
  });

  it("never invents a strength the answer did not show", () => {
    const understanding = understandAnswer("I would add an index.", Q);
    const record = recordEvidence({
      turn: 1,
      atMs: 0,
      questionText: Q,
      answerText: "I would add an index.",
      topicLabel: "Databases",
      intent: deriveIntent(understanding),
      understanding,
    });
    expect(record.strengths).not.toContain("acknowledged a trade-off");
    expect(record.strengths).not.toContain("considered scale");
  });

  it("carries no score, because correctness is never established", () => {
    const understanding = understandAnswer(strong, Q);
    const record = recordEvidence({
      turn: 1,
      atMs: 0,
      questionText: Q,
      answerText: strong,
      topicLabel: null,
      intent: deriveIntent(understanding),
      understanding,
    });
    expect(record).not.toHaveProperty("score");
    expect(understanding.correctness).toBe("UNKNOWN");
  });
});

describe("follow-ups stay on the thread", () => {
  it("a strong answer is pushed further, not congratulated", () => {
    const strong =
      "We chose it because we needed transactions. For example, a payment without an order row was silent data loss.";
    const understanding = understandAnswer(strong, Q);
    const intent = deriveIntent(understanding);
    const text = instructionFor({
      intent,
      understanding,
      answerText: strong,
      questionText: Q,
      topicLabel: "Databases",
    });

    expect(staysOnTopic(intent)).toBe(true);
    expect(text).toMatch(/do not praise/i);
  });

  it("a weak answer narrows rather than moving on", () => {
    const intent = deriveIntent(understandAnswer("I'm not sure.", Q));
    expect(intent).toBe("SIMPLIFY");
    expect(staysOnTopic(intent)).toBe(true);

    const text = instructionFor({
      intent,
      understanding: understandAnswer("I'm not sure.", Q),
      answerText: "I'm not sure.",
      questionText: Q,
      topicLabel: "Databases",
    });
    expect(text).toMatch(/same subject|foundational/i);
    expect(text).not.toMatch(/tell them the answer|reveal/i);
  });

  it("a vague answer is asked for something concrete", () => {
    const vague =
      "We picked it because relational integrity mattered more than raw write throughput for that workload.";
    expect(deriveIntent(understandAnswer(vague, Q))).toBe("ASK_FOR_EXAMPLE");
  });

  it("a repair never counts as an answer", () => {
    for (const text of ["Can you repeat that?", "I don't understand the question"]) {
      expect(isConversationalRepair(deriveIntent(understandAnswer(text, Q)))).toBe(true);
    }
  });

  it("no instruction ever reveals whether the candidate was right", () => {
    for (const text of ["Postgres.", "I'm not sure.", "We used Redis because it is fast."]) {
      const understanding = understandAnswer(text, Q);
      const instruction = instructionFor({
        intent: deriveIntent(understanding),
        understanding,
        answerText: text,
        questionText: Q,
        topicLabel: "Databases",
      });
      expect(instruction).not.toMatch(/tell them (they are|they're) (right|wrong|correct)/i);
      expect(instruction).not.toMatch(/give them the answer/i);
    }
  });
});

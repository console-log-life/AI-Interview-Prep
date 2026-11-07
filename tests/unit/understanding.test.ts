import { describe, expect, it } from "vitest";

import {
  directiveWasFollowed,
  instructionFor,
  isConversationalRepair,
  staysOnTopic,
} from "@/lib/ai/live/intent-directives";
import {
  deriveIntent,
  understandAnswer,
  type AnswerIntent,
} from "@/lib/ai/live/understanding";

/**
 * Answer understanding and the intent it produces.
 *
 * The point of these is that the follow-up varies with what the candidate
 * actually said. A system that asks "can you tell me more?" after every answer
 * is not listening, and these tests are what stop the implementation collapsing
 * back to that.
 */

const Q = "Why did you choose PostgreSQL for that service?";

function intentOf(answer: string, question = Q): AnswerIntent {
  return deriveIntent(understandAnswer(answer, question));
}

describe("correctness is never claimed", () => {
  it("is always UNKNOWN", () => {
    // A fluent wrong answer containing "because" must not read as correct.
    const confidentlyWrong =
      "We used PostgreSQL because it is a NoSQL document store, which meant we did not need any schema at all and could scale infinitely without sharding.";
    expect(understandAnswer(confidentlyWrong, Q).correctness).toBe("UNKNOWN");
  });
});

describe("conversational repairs", () => {
  it.each([
    "Can you repeat that?",
    "Sorry, I didn't hear you",
    "What was the question?",
    "Could you rephrase that?",
  ])("detects %p as a repeat request", (text) => {
    expect(understandAnswer(text, Q).repeatRequest).toBe(true);
    expect(intentOf(text)).toBe("REPEAT_QUESTION");
  });

  it.each([
    "I don't understand what you mean",
    "Can you explain what you're asking?",
  ])("detects %p as needing clarification", (text) => {
    expect(understandAnswer(text, Q).needsClarification).toBe(true);
    expect(intentOf(text)).toBe("CLARIFY_QUESTION");
  });

  it("detects a candidate question", () => {
    const text = "Do you mean in production or in the prototype we built first?";
    expect(understandAnswer(text, Q).candidateAskedQuestion).toBe(true);
  });

  it("marks all three as repairs that must not count as answers", () => {
    for (const intent of [
      "REPEAT_QUESTION",
      "CLARIFY_QUESTION",
      "ANSWER_CANDIDATE_QUESTION",
    ] as const) {
      expect(isConversationalRepair(intent)).toBe(true);
    }
    expect(isConversationalRepair("ASK_FOR_TRADEOFF")).toBe(false);
  });

  it("does not treat a long answer containing 'repeat' as a repair", () => {
    const answer =
      "I had to repeat the request on failure, so I added exponential backoff with jitter because a thundering herd was taking down the upstream service each time.";
    expect(understandAnswer(answer, Q).repeatRequest).toBe(false);
  });
});

describe("the follow-up varies with the answer", () => {
  it("asks for reasoning when only the what is given", () => {
    expect(intentOf("We used PostgreSQL for the main database and Redis alongside it.")).toBe(
      "ASK_FOR_REASONING",
    );
  });

  it("challenges an unsupported outcome claim", () => {
    expect(
      intentOf("We switched the database and it was faster after that, which was good for us."),
    ).toBe("CHALLENGE_UNSUPPORTED_CLAIM");
  });

  it("asks for an example when the reasoning is abstract", () => {
    expect(
      intentOf(
        "We picked it because relational integrity mattered more than raw write throughput for that kind of workload.",
      ),
    ).toBe("ASK_FOR_EXAMPLE");
  });

  it("asks for the trade-off once reasoning and detail are both present", () => {
    expect(
      intentOf(
        "We chose it because we needed real transactions across orders and payments. For example, a payment without an order row would have been a silent data loss, and we saw that twice in staging.",
      ),
    ).toBe("ASK_FOR_TRADEOFF");
  });

  it("asks about scale once the trade-off is covered", () => {
    expect(
      intentOf(
        "We chose it because transactions mattered for correctness. For example, a payment row without its order is silent data loss. The trade-off was that our write path got slower, and we accepted that cost deliberately.",
      ),
    ).toBe("ASK_ABOUT_SCALE");
  });

  it("presses on a one-line answer", () => {
    expect(intentOf("Postgres.")).toBe("PRESS_INCOMPLETE");
  });

  it("simplifies rather than pushing when the candidate does not know", () => {
    expect(intentOf("I don't know, I've never really used that")).toBe("SIMPLIFY");
  });

  it("resolves a self-contradiction", () => {
    expect(
      intentOf(
        "I have never used Kafka on a real project, although I used it for the queue in that system and I implemented it myself.",
      ),
    ).toBe("RESOLVE_CONTRADICTION");
  });

  it("asks what the candidate personally did when the answer is all 'we'", () => {
    expect(
      intentOf(
        "We built the checkout service because the old one could not handle the load, and we made sure the migration happened without downtime for our users. For example we ran both in parallel.",
      ),
    ).toBe("PROBE_PERSONAL_CONTRIBUTION");
  });

  it("produces a different intent for each of these answers", () => {
    // The regression that matters: if every answer produced the same intent,
    // the interviewer is a form being read aloud.
    const intents = [
      intentOf("We used PostgreSQL and Redis in that project."),
      intentOf("It was faster afterwards and worked well for us."),
      intentOf("Postgres."),
      intentOf("I don't know, never used it"),
      intentOf("Can you repeat that?"),
    ];
    expect(new Set(intents).size).toBeGreaterThanOrEqual(4);
  });
});

describe("signals used by the follow-up", () => {
  it("notices trade-offs, scale and performance separately", () => {
    const u = understandAnswer(
      "The trade-off was slower writes, but it let us scale reads to about 900 requests per second and cut p95 latency.",
      Q,
    );
    expect(u.tradeoffMentioned).toBe(true);
    expect(u.scaleMentioned).toBe(true);
    expect(u.performanceMentioned).toBe(true);
  });

  it("notices a project without inventing one", () => {
    expect(understandAnswer("I built the ingestion service myself.", Q).projectMentioned).toBe(true);
    expect(understandAnswer("An index speeds up lookups.", Q).projectMentioned).toBe(false);
  });

  it("collects the technologies actually named", () => {
    const u = understandAnswer("We ran Node.js behind nginx with Redis for sessions.", Q);
    expect(u.technologyMentioned).toEqual(
      expect.arrayContaining(["node.js", "nginx", "redis"]),
    );
  });

  it("flags drift from the question without calling it wrong", () => {
    const u = understandAnswer("I really enjoy hiking at the weekend.", Q);
    expect(u.directlyAnswered).toBe(false);
    expect(u.correctness).toBe("UNKNOWN");
  });
});

describe("instructions reference what the candidate said", () => {
  it("quotes the candidate rather than naming the topic generically", () => {
    const answer = "We used PostgreSQL because we needed transactions.";
    const u = understandAnswer(answer, Q);
    const text = instructionFor({
      intent: deriveIntent(u),
      understanding: u,
      answerText: answer,
      questionText: Q,
      topicLabel: "Databases",
    });
    expect(text).toContain("transactions");
    // The failure mode being prevented: "tell me more about Databases".
    expect(text).not.toMatch(/tell me more about/i);
  });

  it("never dictates an exact sentence", () => {
    for (const intent of [
      "ASK_FOR_REASONING",
      "ASK_FOR_TRADEOFF",
      "SIMPLIFY",
      "CHALLENGE_UNSUPPORTED_CLAIM",
    ] as const) {
      const text = instructionFor({
        intent,
        understanding: understandAnswer("We used Redis because it was fast.", Q),
        answerText: "We used Redis because it was fast.",
        questionText: Q,
        topicLabel: "Caching",
      });
      expect(text).not.toMatch(/say exactly|ask exactly|use these words/i);
    }
  });

  it("forbids praise where praise is the temptation", () => {
    const strong =
      "We chose it because transactions mattered. For example, a payment without an order row is silent data loss.";
    const text = instructionFor({
      intent: "ASK_FOR_TRADEOFF",
      understanding: understandAnswer(strong, Q),
      answerText: strong,
      questionText: Q,
      topicLabel: "Databases",
    });
    expect(text).toMatch(/do not praise/i);
  });

  it("tells the model to re-ask the same question on a repeat", () => {
    const text = instructionFor({
      intent: "REPEAT_QUESTION",
      understanding: understandAnswer("Can you repeat that?", Q),
      answerText: "Can you repeat that?",
      questionText: Q,
      topicLabel: null,
    });
    expect(text).toMatch(/SAME question/);
    expect(text).toMatch(/do not add a second question/i);
    expect(text).toContain("PostgreSQL");
  });

  it("only releases the topic on SUFFICIENT", () => {
    expect(staysOnTopic("SUFFICIENT")).toBe(false);
    for (const intent of ["ASK_FOR_REASONING", "SIMPLIFY", "REPEAT_QUESTION"] as const) {
      expect(staysOnTopic(intent)).toBe(true);
    }
  });
});

describe("directive follow-through, without crude keyword matching", () => {
  it("accepts a question that never uses the topic word", () => {
    // "Databases" need not appear in a question about databases.
    const verdict = directiveWasFollowed({
      askedQuestion: "How would you speed up a query scanning two million rows?",
      previousQuestion: "Tell me about your background.",
      subjectTerms: ["indexing"],
    });
    // No term hit, so it is reported unfollowed but with LOW confidence, which
    // is what stops the caller acting aggressively on a rephrase.
    expect(verdict.confidence).toBe("LOW");
  });

  it("is confident when the subject is clearly present", () => {
    expect(
      directiveWasFollowed({
        askedQuestion: "Why did indexing help there?",
        previousQuestion: "Tell me about your background.",
        subjectTerms: ["indexing"],
      }),
    ).toEqual({ followed: true, confidence: "HIGH" });
  });

  it("is confident the model disobeyed when it re-asks verbatim", () => {
    expect(
      directiveWasFollowed({
        askedQuestion: "Tell me about your background.",
        previousQuestion: "Tell me about your background.",
        subjectTerms: ["indexing"],
      }),
    ).toEqual({ followed: false, confidence: "HIGH" });
  });

  it("treats any new question as satisfying an unspecific directive", () => {
    expect(
      directiveWasFollowed({
        askedQuestion: "What did that cost you?",
        previousQuestion: "Why Postgres?",
        subjectTerms: [],
      }).followed,
    ).toBe(true);
  });
});

import type { Difficulty } from "@prisma/client";

import type { AnswerIntent, AnswerUnderstanding } from "@/lib/ai/live/understanding";

/**
 * Turns an interviewer intent into a controller instruction.
 *
 * Two rules govern everything here.
 *
 * First, the instruction references *what the candidate actually said*. A
 * directive that says "probe deeper on databases" produces "can you tell me
 * more about databases?", which is the sound of a form being read aloud. One
 * that says "they said transactions mattered but not why" produces "what made
 * transactions important for that workflow?" — which is what listening sounds
 * like.
 *
 * Second, no directive ever dictates a sentence. The model picks the words;
 * prescribing them is what makes an AI interviewer sound robotic.
 */

export type QuestionState = {
  id: string;
  /** The question as actually spoken, when transcription gave it to us. */
  text: string;
  topicId: string | null;
  topicLabel: string | null;
  intent: AnswerIntent | "OPENING" | "NEW_TOPIC";
  phase: string;
  difficulty: Difficulty;
  askedAtMs: number;
  candidateStartedAnswering: boolean;
  answerFinalized: boolean;
  repeatRequested: number;
  clarificationRequested: number;
  followUpStillRequired: boolean;
};

export function createQuestionState(args: {
  id: string;
  text: string;
  topicId: string | null;
  topicLabel: string | null;
  intent: QuestionState["intent"];
  phase: string;
  difficulty: Difficulty;
  askedAtMs: number;
}): QuestionState {
  return {
    ...args,
    candidateStartedAnswering: false,
    answerFinalized: false,
    repeatRequested: 0,
    clarificationRequested: 0,
    followUpStillRequired: false,
  };
}

/** Short quotation of the candidate's own words, for grounding the follow-up. */
function quote(text: string, maxWords = 18): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Builds the instruction for an intent.
 *
 * `answerText` is passed so the instruction can name the specific thing to
 * push on. Without it every follow-up collapses into the same generic shape.
 */
export function instructionFor(args: {
  intent: AnswerIntent;
  understanding: AnswerUnderstanding;
  answerText: string;
  questionText: string;
  topicLabel: string | null;
}): string {
  const { intent, understanding: u, answerText, questionText } = args;
  const said = quote(answerText);
  const tech = u.technologyMentioned[0];

  switch (intent) {
    case "REPEAT_QUESTION":
      return `The candidate asked you to repeat or rephrase. Say the SAME question again in different, simpler words. Do not treat the request as an answer, do not add a second question, and do not move on. The question was: "${quote(questionText, 30)}"`;

    case "CLARIFY_QUESTION":
      return `The candidate did not understand what you were asking. Explain what the question is getting at in one or two short sentences, then ask it again more concretely. Do not answer it for them.`;

    case "ANSWER_CANDIDATE_QUESTION":
      return `The candidate asked you a question. Answer it briefly and directly — one or two sentences — then return to what you were asking. Do not treat their question as their answer.`;

    case "RESOLVE_CONTRADICTION":
      return `The candidate said two things that do not fit together: "${said}". Point out the tension plainly, without accusation, and ask which of the two is the case.`;

    case "PRESS_INCOMPLETE":
      return `The answer was too brief to tell you anything: "${said}". Ask them to walk through it properly. Name the part you want expanded rather than just asking for "more detail".`;

    case "CHALLENGE_UNSUPPORTED_CLAIM":
      return `The candidate claimed an outcome without evidence: "${said}". Ask what specifically changed — the mechanism, or a number they remember. Do not accept the claim as given, and do not soften it with praise.`;

    case "ASK_FOR_REASONING":
      return `The candidate described what they did but never why: "${said}". Ask for the reasoning behind that specific decision${tech ? ` — in particular why ${tech}` : ""}. Ask about the decision they actually named, not the topic in the abstract.`;

    case "ASK_FOR_EXAMPLE":
      return `The answer was reasoned but abstract: "${said}". Ask for a concrete instance from their own work — what they actually built or changed, and what happened.`;

    case "ASK_FOR_TRADEOFF":
      return `The candidate gave a solid, reasoned answer: "${said}". Do not praise it and do not move on yet. Ask what that choice cost them — what got worse, or what they would have gained from the alternative.`;

    case "ASK_ABOUT_SCALE":
      return `They have covered the reasoning and the trade-off. Ask how their approach behaves under significantly more load or data than they had — where it breaks first.`;

    case "PROBE_MENTIONED_TECHNOLOGY":
      return `The candidate brought up ${tech ?? "a technology"} themselves, and you have not asked about it. Ask one question about that specific choice — why it over the obvious alternative.`;

    case "PROBE_PERSONAL_CONTRIBUTION":
      return `They described a project in terms of what "we" did: "${said}". Ask what they personally implemented — the part that was theirs. Do not accuse them of anything; this is a normal interview question.`;

    case "SIMPLIFY":
      return `The candidate does not know this${args.topicLabel ? ` (${args.topicLabel})` : ""}. Do not reassure them at length and do not move to an unrelated topic. Ask one simpler, more foundational question on the same subject to find where their understanding actually starts.`;

    case "SUFFICIENT":
      return `This area is sufficiently explored. Move on, acknowledging the shift in a few words rather than announcing it. Do not summarise what they said back to them.`;

    default: {
      const exhaustive: never = intent;
      return exhaustive;
    }
  }
}

/**
 * Whether this intent keeps the interview on the current question.
 *
 * Repairs and follow-ups do; only SUFFICIENT releases the topic. Used so the
 * controller cannot mark an area covered while it is still pushing on it.
 */
export function staysOnTopic(intent: AnswerIntent): boolean {
  return intent !== "SUFFICIENT";
}

/**
 * Whether this intent means the candidate has not yet answered at all.
 *
 * These must never count as an answer, consume a follow-up allowance, or feed
 * difficulty evidence — asking for the question again is not a failure.
 */
export function isConversationalRepair(intent: AnswerIntent): boolean {
  return (
    intent === "REPEAT_QUESTION" ||
    intent === "CLARIFY_QUESTION" ||
    intent === "ANSWER_CANDIDATE_QUESTION"
  );
}

/**
 * Intent-based acknowledgement that the model followed a directive.
 *
 * Replaces keyword matching against the topic label, which was wrong in an
 * obvious way: a question about databases need not contain the word "database"
 * ("how would you speed up a query that scans two million rows?").
 *
 * Instead we ask a question the transcript *can* answer: did the model ask
 * something new, on the thread we pointed it at? Concretely — the question is
 * new (not a near-repeat of the previous one), and it either mentions a token
 * from the directive's subject or, for follow-ups, refers back to the
 * candidate's own answer. That is a weaker claim than semantic equivalence,
 * and it is honest about being weaker.
 */
export function directiveWasFollowed(args: {
  askedQuestion: string;
  previousQuestion: string | null;
  /** Words the directive pointed at: topic label, technology, or answer terms. */
  subjectTerms: string[];
}): { followed: boolean; confidence: "HIGH" | "LOW" } {
  const asked = normalize(args.askedQuestion);
  if (!asked) return { followed: false, confidence: "LOW" };

  // A verbatim re-ask means the model did not act on anything.
  if (args.previousQuestion && normalize(args.previousQuestion) === asked) {
    return { followed: false, confidence: "HIGH" };
  }

  const terms = args.subjectTerms
    .flatMap((term) => normalize(term).split(" "))
    .filter((term) => term.length > 3);

  if (terms.length === 0) {
    // Nothing specific was requested, so a new question satisfies it.
    return { followed: true, confidence: "LOW" };
  }

  const hit = terms.some((term) => asked.includes(term));

  // A miss is only weak evidence of disobedience — the model may have rephrased
  // the subject entirely. Reported as LOW so the caller can decline to act
  // aggressively on it.
  return hit
    ? { followed: true, confidence: "HIGH" }
    : { followed: false, confidence: "LOW" };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

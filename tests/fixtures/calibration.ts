import type { InterviewType } from "@prisma/client";

/**
 * Calibration set for the answer evaluator.
 *
 * Twelve question/answer pairs written for this file, spanning the whole range
 * an evaluator has to separate: an answer that genuinely demonstrates
 * understanding, one that is half-right, one that is confidently wrong, one
 * that admits ignorance, and one that answers a different question entirely.
 *
 * The point is not to pin exact scores — a language model will not reproduce a
 * number, and a test that demanded one would be measuring noise. What matters
 * is that the *ordering* holds and that the failure modes that would embarrass
 * the product do not appear:
 *
 * - "I don't know" must not score like a partial answer. If it does, the
 *   report tells a candidate they are doing fine when they are not.
 * - A confidently wrong answer must score below a hedged correct one.
 *   Rewarding fluency over accuracy is the single worst thing an interview
 *   grader can do.
 * - An off-topic answer must not inherit credit for sounding technical.
 *
 * All content here is original, written for this repository from standard
 * computer-science fundamentals. Nothing is taken from any company's interview
 * process or from any third-party question bank.
 */

export type AnswerQuality =
  | "EXCELLENT"
  | "AVERAGE"
  | "WEAK"
  | "WRONG"
  | "OFF_TOPIC"
  | "DONT_KNOW";

export type CalibrationCase = {
  id: string;
  type: InterviewType;
  topic: string;
  quality: AnswerQuality;
  question: string;
  answer: string;
  /** Inclusive 0-10 range this answer should land in. */
  expected: [number, number];
  /** Why this range, so a disagreement is arguable rather than arbitrary. */
  rationale: string;
};

export const CALIBRATION_CASES: CalibrationCase[] = [
  // --- technical -----------------------------------------------------------
  {
    id: "tech-excellent-index",
    type: "TECHNICAL",
    topic: "Databases",
    quality: "EXCELLENT",
    question:
      "A query filtering on a single column has become slow as the table grew. How do you decide whether an index will help?",
    answer:
      "First I'd confirm the query is actually the problem with EXPLAIN ANALYZE, and look at whether it's a sequential scan and how the planner's row estimate compares to the real count. An index helps when the filter is selective — if it returns five percent of the table the planner will use it, if it returns sixty percent a scan is genuinely cheaper and the index gets ignored. I'd also check the write pattern, because every index is maintained on insert and update, so on a table that is written far more than it is read I might prefer a partial index on just the rows we query. After adding it I'd re-run EXPLAIN to confirm the planner picked it rather than assuming it did.",
    expected: [8, 10],
    rationale:
      "Correct, reasoned, mentions selectivity, write cost and verification. This is what a strong answer looks like.",
  },
  {
    id: "tech-average-acid",
    type: "TECHNICAL",
    topic: "Databases",
    quality: "AVERAGE",
    question: "What does ACID mean in a relational database?",
    answer:
      "Atomicity, Consistency, Isolation, Durability. Atomicity means the transaction either fully happens or doesn't happen at all. Durability means once it's committed it survives a crash. I know isolation is about concurrent transactions not interfering but I couldn't tell you the different isolation levels in detail.",
    expected: [4, 7],
    rationale:
      "Accurate as far as it goes, correctly scoped about its own limits, but shallow on isolation. Mid-range.",
  },
  {
    id: "tech-wrong-confident",
    type: "TECHNICAL",
    topic: "Databases",
    quality: "WRONG",
    question: "What is the difference between a clustered and a non-clustered index?",
    answer:
      "A clustered index is just an index that's been cached in memory, so it's always faster. You can have as many clustered indexes as you want on a table, and you should add one to every column because it speeds up both reads and writes.",
    expected: [0, 3],
    rationale:
      "Confidently wrong on every point. Must score below the hedged-but-correct answer above; rewarding fluency over accuracy is the worst failure an interview grader has.",
  },
  {
    id: "tech-dont-know",
    type: "TECHNICAL",
    topic: "Operating systems",
    quality: "DONT_KNOW",
    question: "What is the difference between a process and a thread?",
    answer: "I'm not sure, I haven't studied that properly yet.",
    expected: [0, 2],
    rationale:
      "An honest admission with no content. Must not score like a partial answer, or the report congratulates a candidate who answered nothing.",
  },
  {
    id: "tech-off-topic",
    type: "TECHNICAL",
    topic: "Networking",
    quality: "OFF_TOPIC",
    question: "Why does TCP need a three-way handshake?",
    answer:
      "I've worked a lot with REST APIs. I use Express and I always set up proper error handling middleware, and I make sure to use the right status codes like 404 and 500. I've also used Postman for testing endpoints.",
    expected: [0, 3],
    rationale:
      "Technically literate and entirely unrelated to the question. Must not inherit credit for sounding competent.",
  },
  {
    id: "tech-average-oop",
    type: "TECHNICAL",
    topic: "OOP",
    quality: "AVERAGE",
    question: "What is polymorphism, and when have you used it?",
    answer:
      "Polymorphism is when the same method call behaves differently depending on the object's actual type. I used it in a Java project where I had a Shape base class and Circle and Square subclasses each overriding area, and the renderer just called area on whatever it had.",
    expected: [5, 8],
    rationale:
      "Correct definition with a real if textbook example. Solid but not deep — no discussion of why it helped.",
  },

  // --- behavioural ---------------------------------------------------------
  {
    id: "behav-excellent-star",
    type: "BEHAVIORAL",
    topic: "Conflict",
    quality: "EXCELLENT",
    question: "Tell me about a time you disagreed with a technical decision on your team.",
    answer:
      "On a college project team we were building a bus-tracking app and my teammate wanted to poll the server every two seconds for vehicle positions. I thought that would not hold up, so rather than argue about it I wrote a small load test and we watched it together — at about two hundred simulated users the server was spending most of its time on requests that returned nothing new. I proposed WebSockets instead. He pushed back because none of us had used them, which was fair, so we agreed I'd spike it over two days and we'd drop it if it wasn't working. It worked, we shipped it, and the thing I took from it was that showing him the number ended the disagreement in about ten minutes when talking about it hadn't.",
    expected: [8, 10],
    rationale:
      "Clear situation, action, result, a specific number, and genuine reflection. Owns their part without dismissing the other person.",
  },
  {
    id: "behav-average-vague",
    type: "BEHAVIORAL",
    topic: "Teamwork",
    quality: "AVERAGE",
    question: "Tell me about a time you had to work with a difficult teammate.",
    answer:
      "I had a teammate on a group project who wasn't really pulling their weight. I talked to them about it and things got a bit better after that, and we finished the project on time. I think communication is really important in a team.",
    expected: [3, 6],
    rationale:
      "A real situation but no specifics, no detail on what was actually said, and the lesson is a platitude. Weak-to-mid; must not score as highly as the STAR answer above.",
  },
  {
    id: "behav-off-topic",
    type: "BEHAVIORAL",
    topic: "Failure",
    quality: "OFF_TOPIC",
    question: "Tell me about a time a project of yours failed, and what you learned.",
    answer:
      "I'm a really fast learner and I'm very passionate about backend development. I'd say my biggest strength is that I never give up on a problem, and I'm looking for a role where I can keep growing.",
    expected: [0, 3],
    rationale:
      "Answers a different question — strengths instead of a failure — and contains no incident at all.",
  },
  {
    id: "behav-dont-know",
    type: "BEHAVIORAL",
    topic: "Leadership",
    quality: "DONT_KNOW",
    question: "Describe a time you led a piece of work end to end.",
    answer:
      "Honestly I haven't had a chance to lead anything yet. I've only worked on parts of projects that someone else was coordinating.",
    expected: [0, 3],
    rationale:
      "Honest and relevant, but supplies no evidence of the thing asked about. Low score, and the report must not treat the honesty as a gap in character.",
  },

  // --- system design -------------------------------------------------------
  {
    id: "design-excellent",
    type: "SYSTEM_DESIGN",
    topic: "System design",
    quality: "EXCELLENT",
    question: "Design a URL shortener. Walk me through your approach.",
    answer:
      "I'd start with the numbers, because they decide everything else. Say a hundred million new links a year and a read-to-write ratio of about a hundred to one — that's read-heavy, so reads are what I optimise. The core is a mapping from a short code to a long URL. For the code I'd use a base62 encoding of an ID from a counter rather than hashing the URL, because hashing needs collision handling and a counter does not; the cost is that the codes are guessable in sequence, which matters if links are meant to be private, so if that's a requirement I'd add random padding. Storage is a key-value lookup by primary key, which Postgres handles fine at this scale, and I'd put a cache in front keyed on the short code since the distribution is heavily skewed to a few popular links. Redirects return 302 rather than 301 so we keep seeing the traffic and can count clicks. The part I'd want to think hardest about is the counter, because a single sequence is a single point of failure — I'd probably hand out ranges to each application instance so they can allocate locally.",
    expected: [8, 10],
    rationale:
      "Starts from requirements, makes a decision and names its trade-off, picks a cache for a stated reason, and identifies its own weakest point.",
  },
  {
    id: "design-buzzwords",
    type: "SYSTEM_DESIGN",
    topic: "System design",
    quality: "WEAK",
    question: "How would you design a system to handle a large spike in traffic?",
    answer:
      "I'd use microservices on Kubernetes with auto-scaling, put everything behind a load balancer, add Redis for caching and Kafka for the queues, and use a CDN. That architecture is highly scalable and fault tolerant so it would handle any amount of traffic.",
    expected: [1, 4],
    rationale:
      "A list of technologies with no reasoning, no numbers, and a claim ('any amount of traffic') the answer cannot support. Must score below the design answer above.",
  },
];

/** Does a score fall inside a case's expected range? */
export function inRange(value: number, [low, high]: [number, number]): boolean {
  return value >= low && value <= high;
}

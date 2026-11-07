import type { Difficulty, QuestionCategory, QuestionType } from "@prisma/client";

/**
 * Development seed questions.
 *
 * These are ORIGINAL practice questions written for this project from public
 * computer-science fundamentals. They are demo/development content — they are
 * not, and are not presented as, real or confidential questions from any
 * company's interview process.
 */

export type SeedOption = { text: string; isCorrect: boolean };

export type SeedQuestion = {
  text: string;
  category: QuestionCategory;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  options?: SeedOption[];
  expectedAnswer?: string;
  explanation: string;
  skillsTested: string[];
  tags: string[];
  points?: number;
};

const T = (text: string): SeedOption => ({ text, isCorrect: true });
const F = (text: string): SeedOption => ({ text, isCorrect: false });

export const SEED_QUESTIONS: SeedQuestion[] = [
  // ---------------------------------------------------------------- DSA
  {
    text: "What is the average-case time complexity of searching for a key in a balanced binary search tree containing n nodes?",
    category: "DSA",
    topic: "Trees",
    difficulty: "EASY",
    type: "MCQ",
    options: [F("O(1)"), T("O(log n)"), F("O(n)"), F("O(n log n)")],
    explanation:
      "A balanced BST halves the search space at each level, so its height is O(log n) and a search visits at most that many nodes. An unbalanced tree can degrade to O(n).",
    skillsTested: ["Time complexity", "Binary search trees"],
    tags: ["complexity", "trees"],
  },
  {
    text: "Which data structure gives O(1) average-case insertion, deletion and lookup?",
    category: "DSA",
    topic: "Hashing",
    difficulty: "EASY",
    type: "MCQ",
    options: [
      F("Sorted array"),
      F("Balanced BST"),
      T("Hash table"),
      F("Singly linked list"),
    ],
    explanation:
      "A hash table computes a bucket index directly from the key. Collisions make the worst case O(n), but with a good hash function and load factor the average is O(1).",
    skillsTested: ["Hash tables", "Time complexity"],
    tags: ["hashing", "complexity"],
  },
  {
    text: "Select every sorting algorithm that is stable in its standard implementation.",
    category: "DSA",
    topic: "Sorting",
    difficulty: "MEDIUM",
    type: "MULTI_SELECT",
    options: [
      T("Merge sort"),
      F("Quick sort"),
      T("Insertion sort"),
      F("Heap sort"),
      T("Counting sort"),
    ],
    explanation:
      "A stable sort preserves the relative order of equal keys. Merge, insertion and counting sort are stable. Quick sort and heap sort swap non-adjacent elements, which can reorder equal keys.",
    skillsTested: ["Sorting algorithms", "Stability"],
    tags: ["sorting"],
    points: 2,
  },
  {
    text: "A queue implemented with two stacks has amortised O(1) dequeue cost.",
    category: "DSA",
    topic: "Stacks and queues",
    difficulty: "MEDIUM",
    type: "TRUE_FALSE",
    options: [T("True"), F("False")],
    explanation:
      "Each element is moved from the input stack to the output stack at most once, so although a single dequeue can cost O(n), the cost amortises to O(1) across a sequence of operations.",
    skillsTested: ["Amortised analysis", "Stacks"],
    tags: ["stacks", "queues"],
  },
  {
    text: "Which algorithm finds shortest paths from a single source in a weighted graph that may contain negative edge weights (but no negative cycles)?",
    category: "DSA",
    topic: "Graphs",
    difficulty: "HARD",
    type: "MCQ",
    options: [
      F("Dijkstra's algorithm"),
      T("Bellman-Ford algorithm"),
      F("Breadth-first search"),
      F("Prim's algorithm"),
    ],
    explanation:
      "Dijkstra assumes non-negative weights because it finalises a node's distance on first visit. Bellman-Ford relaxes every edge V-1 times, which handles negative weights and detects negative cycles.",
    skillsTested: ["Graph algorithms", "Shortest paths"],
    tags: ["graphs", "shortest-path"],
    points: 2,
  },
  {
    text: "Explain the difference between memoization and tabulation in dynamic programming, and when you would prefer each.",
    category: "DSA",
    topic: "Dynamic programming",
    difficulty: "MEDIUM",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "Memoization is top-down: you write the natural recursion and cache each subproblem's result the first time it is computed. Tabulation is bottom-up: you fill a table in dependency order with no recursion. Memoization only evaluates the subproblems actually reachable from the input, which wins when the reachable state space is sparse, and it is usually closer to the recursive definition so it is easier to write correctly. Tabulation avoids recursion-stack overhead and stack-overflow risk, has better cache locality, and often allows space optimisation by keeping only the last row or two. Prefer memoization while exploring the recurrence or when many states are unreachable; prefer tabulation for production code, deep recursions, or when you want to reduce space.",
    explanation:
      "A strong answer covers direction (top-down vs bottom-up), the sparse-state argument for memoization, the stack and locality argument for tabulation, and space optimisation.",
    skillsTested: ["Dynamic programming", "Communication"],
    tags: ["dp"],
    points: 3,
  },

  // ---------------------------------------------------------------- DBMS
  {
    text: "Which SQL join returns every row from the left table, plus matching rows from the right table (NULLs where there is no match)?",
    category: "DBMS",
    topic: "SQL joins",
    difficulty: "EASY",
    type: "MCQ",
    options: [
      F("INNER JOIN"),
      T("LEFT OUTER JOIN"),
      F("RIGHT OUTER JOIN"),
      F("CROSS JOIN"),
    ],
    explanation:
      "LEFT OUTER JOIN preserves all left-hand rows. INNER JOIN drops unmatched rows on both sides; RIGHT preserves the right table; CROSS produces the Cartesian product.",
    skillsTested: ["SQL", "Joins"],
    tags: ["sql", "joins"],
  },
  {
    text: "A relation is in third normal form (3NF) but not in Boyce-Codd normal form (BCNF). What must be true?",
    category: "DBMS",
    topic: "Normalisation",
    difficulty: "HARD",
    type: "MCQ",
    options: [
      F("It has a multi-valued dependency"),
      T("It has a functional dependency whose determinant is not a superkey, where the dependent attribute is part of some candidate key"),
      F("It has a partial dependency on a candidate key"),
      F("It contains a repeating group"),
    ],
    explanation:
      "3NF tolerates a dependency X → A where X is not a superkey, provided A is a prime attribute (part of some candidate key). BCNF removes that exemption and requires every determinant to be a superkey — so the gap between 3NF and BCNF is exactly that case.",
    skillsTested: ["Normalisation", "Functional dependencies"],
    tags: ["normalization"],
    points: 3,
  },
  {
    text: "Select every property guaranteed by the ACID model.",
    category: "DBMS",
    topic: "Transactions",
    difficulty: "MEDIUM",
    type: "MULTI_SELECT",
    options: [
      T("Atomicity"),
      T("Consistency"),
      F("Availability"),
      T("Isolation"),
      T("Durability"),
    ],
    explanation:
      "ACID is Atomicity, Consistency, Isolation and Durability. Availability belongs to the CAP theorem, which is about distributed systems, not single-node transaction semantics.",
    skillsTested: ["Transactions", "ACID"],
    tags: ["transactions"],
    points: 2,
  },
  {
    text: "Adding an index to a column always improves overall database performance.",
    category: "DBMS",
    topic: "Indexing",
    difficulty: "EASY",
    type: "TRUE_FALSE",
    options: [F("True"), T("False")],
    explanation:
      "An index speeds up reads that can use it, but every index must be updated on INSERT, UPDATE and DELETE, and it consumes storage. On a write-heavy table an unused index is a net cost.",
    skillsTested: ["Indexing", "Performance"],
    tags: ["indexing"],
  },
  {
    text: "Explain what a database transaction isolation level is, and describe the anomaly that READ COMMITTED still permits.",
    category: "DBMS",
    topic: "Transactions",
    difficulty: "MEDIUM",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "An isolation level defines how much a transaction can be affected by other concurrent transactions — it trades correctness guarantees against concurrency. READ COMMITTED guarantees you never read uncommitted data (no dirty reads), but it still permits non-repeatable reads: reading the same row twice inside one transaction can return different values if another transaction commits an update in between. It also permits phantom reads, where a repeated range query returns a different set of rows. Preventing non-repeatable reads requires REPEATABLE READ; preventing phantoms requires SERIALIZABLE (or a range-locking implementation).",
    explanation:
      "Look for: the trade-off framing, no dirty reads, non-repeatable reads permitted, and ideally phantoms and the levels that fix them.",
    skillsTested: ["Transactions", "Concurrency"],
    tags: ["transactions", "isolation"],
    points: 3,
  },

  // ----------------------------------------------------------------- OOP
  {
    text: "Which OOP principle is directly violated when a subclass overrides a method to throw an exception the parent never threw, breaking callers written against the parent?",
    category: "OOP",
    topic: "SOLID principles",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      F("Single responsibility principle"),
      F("Open/closed principle"),
      T("Liskov substitution principle"),
      F("Interface segregation principle"),
    ],
    explanation:
      "Liskov substitution says a subtype must be usable anywhere its base type is expected. Strengthening preconditions or introducing new failure modes breaks callers that only know the base contract.",
    skillsTested: ["SOLID", "Inheritance"],
    tags: ["solid", "oop"],
  },
  {
    text: "What is the difference between method overloading and method overriding?",
    category: "OOP",
    topic: "Polymorphism",
    difficulty: "EASY",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "Overloading means defining several methods with the same name but different parameter lists in the same class. Which one runs is decided at compile time from the static types of the arguments — this is compile-time (static) polymorphism. Overriding means a subclass provides its own implementation of a method it inherited, with the same signature. Which one runs is decided at run time from the actual object type — this is run-time (dynamic) polymorphism, and it is what enables substitutability through a base-class reference.",
    explanation:
      "The key discriminator is binding time: overloading resolves statically on signature, overriding resolves dynamically on the runtime type.",
    skillsTested: ["Polymorphism", "Communication"],
    tags: ["oop", "polymorphism"],
    points: 2,
  },
  {
    text: "Composition should generally be preferred over inheritance for code reuse.",
    category: "OOP",
    topic: "Design",
    difficulty: "MEDIUM",
    type: "TRUE_FALSE",
    options: [T("True"), F("False")],
    explanation:
      "Inheritance couples a subclass to its parent's implementation, and that coupling is permanent and transitive. Composition lets behaviour be swapped at run time and keeps the dependency to a narrow interface. Inheritance is still correct for genuine is-a relationships.",
    skillsTested: ["Design principles"],
    tags: ["oop", "design"],
  },

  // -------------------------------------------------- Operating systems
  {
    text: "Which condition is NOT one of the four Coffman conditions required for deadlock?",
    category: "OPERATING_SYSTEMS",
    topic: "Deadlocks",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      F("Mutual exclusion"),
      F("Hold and wait"),
      F("No preemption"),
      T("Priority inversion"),
    ],
    explanation:
      "The four Coffman conditions are mutual exclusion, hold and wait, no preemption, and circular wait — all four must hold simultaneously. Priority inversion is a separate scheduling problem.",
    skillsTested: ["Deadlocks", "Concurrency"],
    tags: ["os", "deadlock"],
  },
  {
    text: "What is thrashing, and how does an operating system typically respond to it?",
    category: "OPERATING_SYSTEMS",
    topic: "Memory management",
    difficulty: "HARD",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "Thrashing is when a system spends more time servicing page faults than doing useful work. It happens when the combined working sets of the running processes exceed physical memory, so every process repeatedly evicts pages another process is about to need. The symptom is CPU utilisation collapsing while disk activity saturates. The OS responds by reducing the degree of multiprogramming — suspending or swapping out whole processes so the remaining ones fit in memory — and by using the working-set model or page-fault-frequency control to allocate frames according to each process's actual locality rather than equally.",
    explanation:
      "Strong answers name the working-set model, the counter-intuitive symptom (low CPU utilisation), and reducing multiprogramming as the fix.",
    skillsTested: ["Virtual memory", "Paging"],
    tags: ["os", "memory"],
    points: 3,
  },
  {
    text: "Select every scheduling algorithm that can cause starvation.",
    category: "OPERATING_SYSTEMS",
    topic: "CPU scheduling",
    difficulty: "MEDIUM",
    type: "MULTI_SELECT",
    options: [
      T("Shortest job first"),
      T("Priority scheduling without ageing"),
      F("Round robin"),
      T("Shortest remaining time first"),
    ],
    explanation:
      "Anything that always favours a particular characteristic can starve the processes lacking it — a long job under SJF/SRTF, or a low-priority job under strict priority. Round robin gives every process a slice within one cycle, so it cannot starve.",
    skillsTested: ["Scheduling"],
    tags: ["os", "scheduling"],
    points: 2,
  },

  // -------------------------------------------------- Computer networks
  {
    text: "At which OSI layer does a router primarily operate?",
    category: "COMPUTER_NETWORKS",
    topic: "OSI model",
    difficulty: "EASY",
    type: "MCQ",
    options: [
      F("Layer 2 — Data link"),
      T("Layer 3 — Network"),
      F("Layer 4 — Transport"),
      F("Layer 7 — Application"),
    ],
    explanation:
      "Routers forward packets between networks using IP addresses, which is layer 3. Switches operate at layer 2 on MAC addresses.",
    skillsTested: ["OSI model", "Routing"],
    tags: ["networks", "osi"],
  },
  {
    text: "Explain the TCP three-way handshake and why two messages would not be sufficient.",
    category: "COMPUTER_NETWORKS",
    topic: "TCP",
    difficulty: "MEDIUM",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "The client sends SYN with its initial sequence number. The server replies SYN-ACK, acknowledging the client's sequence number and sending its own. The client replies ACK, acknowledging the server's. Two messages are not enough because the connection is full duplex and each direction needs its own sequence number established and acknowledged. After only SYN and SYN-ACK, the client knows the server received its sequence number, but the server has no confirmation the client received the server's. The third message closes that loop, and it is also what prevents a delayed duplicate SYN from an old connection opening a half-open connection.",
    explanation:
      "Look for both directions needing acknowledged sequence numbers, and ideally the duplicate-SYN argument.",
    skillsTested: ["TCP", "Communication"],
    tags: ["networks", "tcp"],
    points: 3,
  },
  {
    text: "UDP guarantees that packets arrive in the order they were sent.",
    category: "COMPUTER_NETWORKS",
    topic: "UDP",
    difficulty: "EASY",
    type: "TRUE_FALSE",
    options: [F("True"), T("False")],
    explanation:
      "UDP is connectionless and provides no ordering, no retransmission and no delivery guarantee. Applications that need ordering over UDP must implement it themselves — which is what QUIC does.",
    skillsTested: ["UDP", "Transport layer"],
    tags: ["networks", "udp"],
  },

  // ---------------------------------------------------------------- Java
  {
    text: "What is the difference between `==` and `.equals()` when comparing two String objects in Java?",
    category: "JAVA",
    topic: "Strings",
    difficulty: "EASY",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "`==` compares references — whether the two variables point at the same object on the heap. `.equals()` is overridden by String to compare the character sequences. String literals are interned into a shared pool, so two identical literals often are the same object and `==` accidentally appears to work; a String built at run time (via `new String(...)`, concatenation of variables, or user input) is a different object and `==` returns false even when the contents match. Always use `.equals()` for value comparison, and `Objects.equals(a, b)` when either side may be null.",
    explanation:
      "The interning trap is the real point of this question — candidates who have only seen literals often think `==` works.",
    skillsTested: ["Java", "Strings", "Object identity"],
    tags: ["java", "strings"],
    points: 2,
  },
  {
    text: "Which Java collection maintains insertion order AND allows duplicate elements?",
    category: "JAVA",
    topic: "Collections",
    difficulty: "EASY",
    type: "MCQ",
    options: [
      F("HashSet"),
      F("TreeSet"),
      T("ArrayList"),
      F("HashMap"),
    ],
    explanation:
      "ArrayList is an ordered sequence that permits duplicates. Sets reject duplicates; HashSet has no ordering guarantee and TreeSet orders by comparison, not insertion.",
    skillsTested: ["Java collections"],
    tags: ["java", "collections"],
  },
  {
    text: "In Java, a `finally` block always executes even if the `try` block returns a value.",
    category: "JAVA",
    topic: "Exceptions",
    difficulty: "MEDIUM",
    type: "TRUE_FALSE",
    options: [T("True"), F("False")],
    explanation:
      "The return value is computed and held, `finally` runs, then the method returns. The only escapes are `System.exit()`, JVM termination, or the thread being killed. A `return` inside `finally` will override the original return value — which is why it is a bug, not a feature.",
    skillsTested: ["Exception handling"],
    tags: ["java", "exceptions"],
  },

  // -------------------------------------------------------------- Python
  {
    text: "What will `[[]] * 3` produce, and why is it usually a bug?",
    category: "PYTHON",
    topic: "Lists",
    difficulty: "MEDIUM",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "It produces a list of three references to the SAME inner list object, not three independent lists. Appending to one appears to modify all three, because there is only one list. The sequence-repetition operator copies references, not objects. The fix is a comprehension that constructs a new list each iteration: `[[] for _ in range(3)]`.",
    explanation:
      "The core idea is that `*` on a list copies references. The comprehension fix is the expected remedy.",
    skillsTested: ["Python", "Mutability"],
    tags: ["python", "lists"],
    points: 2,
  },
  {
    text: "Which Python data structure is immutable?",
    category: "PYTHON",
    topic: "Data types",
    difficulty: "EASY",
    type: "MCQ",
    options: [F("list"), F("dict"), T("tuple"), F("set")],
    explanation:
      "Tuples cannot be modified after creation, which is what makes them hashable and usable as dictionary keys. Note that a tuple containing a mutable object is still not hashable.",
    skillsTested: ["Python data types"],
    tags: ["python"],
  },
  {
    text: "Select every statement that is true about Python's Global Interpreter Lock (GIL) in CPython.",
    category: "PYTHON",
    topic: "Concurrency",
    difficulty: "HARD",
    type: "MULTI_SELECT",
    options: [
      T("Only one thread executes Python bytecode at a time"),
      F("It prevents race conditions in all Python programs"),
      T("I/O-bound workloads can still benefit from threading"),
      T("multiprocessing sidesteps it by using separate processes"),
    ],
    explanation:
      "The GIL serialises bytecode execution, so CPU-bound threads do not scale across cores. It does NOT make your code thread-safe — a `+=` on a shared counter is still a race, because the GIL can be released between bytecodes. Threads still help for I/O because the GIL is released during blocking calls.",
    skillsTested: ["Python", "Concurrency"],
    tags: ["python", "gil"],
    points: 3,
  },

  // ---------------------------------------------------------- JavaScript
  {
    text: "What is the difference between `let`, `const` and `var` in JavaScript?",
    category: "JAVASCRIPT",
    topic: "Scoping",
    difficulty: "EASY",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "`var` is function-scoped and hoisted, initialised to undefined, so it is readable before its declaration line — and re-declaring it in the same scope is allowed. `let` and `const` are block-scoped and live in the temporal dead zone from the start of the block until the declaration, so reading them early throws a ReferenceError. `const` additionally forbids reassigning the binding, but does not freeze the value: the properties of a const object can still be mutated. Modern code should default to `const` and use `let` only where reassignment is genuinely needed.",
    explanation:
      "The two discriminators are scope (function vs block) and the const-binding-vs-value distinction.",
    skillsTested: ["JavaScript", "Scoping"],
    tags: ["javascript", "es6"],
    points: 2,
  },
  {
    text: "What does `typeof null` evaluate to in JavaScript?",
    category: "JAVASCRIPT",
    topic: "Types",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      F('"null"'),
      T('"object"'),
      F('"undefined"'),
      F("throws a TypeError"),
    ],
    explanation:
      'It returns "object" — a bug from the first JavaScript implementation, where the type tag for objects was 0 and null was the null pointer. It cannot be fixed without breaking the web. Use `value === null` to test for null.',
    skillsTested: ["JavaScript types"],
    tags: ["javascript"],
  },
  {
    text: "In JavaScript, `Promise.all` rejects as soon as any one of its promises rejects.",
    category: "JAVASCRIPT",
    topic: "Async",
    difficulty: "MEDIUM",
    type: "TRUE_FALSE",
    options: [T("True"), F("False")],
    explanation:
      "Promise.all is fail-fast: the first rejection rejects the aggregate immediately, though the other promises keep running. Use Promise.allSettled when you need every outcome regardless of failures.",
    skillsTested: ["Promises", "Async JavaScript"],
    tags: ["javascript", "async"],
  },

  // ------------------------------------------------------------ Aptitude
  {
    text: "A train 180 metres long travelling at 54 km/h crosses a platform in 20 seconds. How long is the platform?",
    category: "APTITUDE",
    topic: "Time, speed and distance",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [F("100 m"), T("120 m"), F("150 m"), F("180 m")],
    explanation:
      "54 km/h = 54 × 5/18 = 15 m/s. In 20 s the train covers 15 × 20 = 300 m, which is the train plus the platform. Platform = 300 − 180 = 120 m.",
    skillsTested: ["Speed and distance", "Unit conversion"],
    tags: ["aptitude", "arithmetic"],
  },
  {
    text: "If the ratio of two numbers is 3:5 and their sum is 88, what is the larger number?",
    category: "APTITUDE",
    topic: "Ratio and proportion",
    difficulty: "EASY",
    type: "MCQ",
    options: [F("33"), F("44"), T("55"), F("66")],
    explanation:
      "Let the numbers be 3x and 5x. Then 8x = 88, so x = 11 and the larger number is 5 × 11 = 55.",
    skillsTested: ["Ratios"],
    tags: ["aptitude"],
  },
  {
    text: "A shopkeeper marks an item 40% above cost, then gives a 25% discount. What is the profit percentage?",
    category: "APTITUDE",
    topic: "Profit and loss",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [F("10%"), T("5%"), F("15%"), F("No profit, no loss")],
    explanation:
      "Take cost = 100. Marked price = 140. Selling price = 140 × 0.75 = 105. Profit = 5 on a cost of 100, so 5%.",
    skillsTested: ["Percentages", "Profit and loss"],
    tags: ["aptitude"],
  },

  // --------------------------------------------------- Logical reasoning
  {
    text: "In a certain code, MONDAY is written as NPOEBZ. How is FRIDAY written in that code?",
    category: "LOGICAL_REASONING",
    topic: "Coding-decoding",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [T("GSJEBZ"), F("GSJDBZ"), F("GSKEBZ"), F("FSJEBZ")],
    explanation:
      "Each letter shifts forward by one: M→N, O→P, N→O, D→E, A→B, Y→Z. Applying the same shift to FRIDAY gives G, S, J, E, B, Z.",
    skillsTested: ["Pattern recognition"],
    tags: ["reasoning"],
  },
  {
    text: "All engineers are problem solvers. Some problem solvers are designers. Which conclusion definitely follows?",
    category: "LOGICAL_REASONING",
    topic: "Syllogisms",
    difficulty: "HARD",
    type: "MCQ",
    options: [
      F("All engineers are designers"),
      F("Some engineers are designers"),
      F("No engineer is a designer"),
      T("None of these conclusions definitely follows"),
    ],
    explanation:
      'The "some problem solvers are designers" group may lie entirely outside the engineers. Nothing forces an overlap either way, so no conclusion about engineers and designers is guaranteed.',
    skillsTested: ["Deductive reasoning"],
    tags: ["reasoning", "syllogism"],
    points: 2,
  },

  // ------------------------------------------------------------------ HR
  {
    text: "Why do you want to work at this company specifically?",
    category: "HR",
    topic: "Motivation",
    difficulty: "EASY",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "A strong answer is specific and verifiable: name something concrete about the company — a product you have actually used, an engineering blog post or open-source project, the problem domain, the scale they operate at — and connect it to your own work or interests with evidence. Then connect it forward: what you want to learn there and what you would contribute in the first six months. Weak answers are interchangeable across employers (\"great culture\", \"good learning opportunity\") and signal that no research was done.",
    explanation:
      "Interviewers are testing research and genuine interest. The test is whether the answer would still make sense if you swapped in a competitor's name — if it would, it is too generic.",
    skillsTested: ["Communication", "Research"],
    tags: ["hr", "motivation"],
    points: 2,
  },
  {
    text: "What is your biggest weakness?",
    category: "HR",
    topic: "Self-awareness",
    difficulty: "MEDIUM",
    type: "SHORT_ANSWER",
    expectedAnswer:
      "Name a real, non-fatal weakness that is genuinely yours, show self-awareness about how it has actually cost you something, and describe the concrete system you put in place to manage it plus the evidence it is working. For example: difficulty asking for help early, which cost two days on a bug you should have escalated, addressed by a rule to time-box independent debugging to ninety minutes before asking — and the last three times you hit that limit you unblocked within the hour. Avoid disguised strengths (\"I'm a perfectionist\"), and avoid anything disqualifying for the role.",
    explanation:
      "The question tests self-awareness and improvement, not confession. The structure that works is: real weakness → concrete cost → specific system → evidence.",
    skillsTested: ["Self-awareness", "Communication"],
    tags: ["hr"],
    points: 2,
  },

  // ---------------------------------------------------------- Behavioural
  {
    text: "Tell me about a time you disagreed with a teammate about a technical decision. How did you handle it?",
    category: "BEHAVIORAL",
    topic: "Conflict resolution",
    difficulty: "MEDIUM",
    type: "BEHAVIORAL",
    expectedAnswer:
      "Use STAR. Situation: the project, the team, and what the two positions actually were. Task: your specific responsibility in resolving it. Action: what you personally did — how you understood their reasoning before arguing, what evidence or prototype you brought, how you separated the technical question from the personal one, and how the decision was finally made. Result: what was decided, how it turned out, and what you learned. The strongest versions include a case where you were persuaded and changed your position — that shows the disagreement was about the right answer, not about winning.",
    explanation:
      "Graders look for STAR structure, a first-person Action section (\"I\", not \"we\"), and a concrete Result. Willingness to be wrong is a strong signal.",
    skillsTested: ["Conflict resolution", "STAR structure", "Teamwork"],
    tags: ["behavioral", "star"],
    points: 3,
  },
  {
    text: "Describe a time you failed to meet a deadline. What happened and what did you change afterwards?",
    category: "BEHAVIORAL",
    topic: "Accountability",
    difficulty: "MEDIUM",
    type: "BEHAVIORAL",
    expectedAnswer:
      "Pick a real miss and own it without deflecting onto teammates or circumstances. Situation and Task: the commitment and why it mattered. Action: the moment you realised it was slipping, who you told and how early, what you cut or renegotiated, and how you limited the damage. Result: the actual outcome, including the cost, and the specific change you made afterwards — smaller estimates, an earlier check-in, breaking work into demonstrable slices — plus evidence that the change held on a later project.",
    explanation:
      "This tests accountability and learning. Communicating the slip early is the behaviour interviewers most want to see; a candidate who blames others is the common failure mode.",
    skillsTested: ["Accountability", "STAR structure"],
    tags: ["behavioral", "star"],
    points: 3,
  },

  // -------------------------------------------------------- System design
  {
    text: "In the CAP theorem, what must a distributed system sacrifice during a network partition?",
    category: "SYSTEM_DESIGN",
    topic: "Distributed systems",
    difficulty: "HARD",
    type: "MCQ",
    options: [
      F("Partition tolerance"),
      T("Either consistency or availability"),
      F("Durability"),
      F("Nothing — all three can be maintained"),
    ],
    explanation:
      "Partitions are a fact of networks, not a design choice, so a distributed system must tolerate them. During a partition it must choose: refuse requests it cannot make consistent (CP), or serve possibly-stale data (AP).",
    skillsTested: ["CAP theorem", "Distributed systems"],
    tags: ["system-design", "cap"],
    points: 2,
  },
  {
    text: "You need to design a URL shortener handling 100 million new URLs per month. Walk through your approach to the ID generation and the storage layer.",
    category: "SYSTEM_DESIGN",
    topic: "System design",
    difficulty: "HARD",
    type: "TECHNICAL",
    expectedAnswer:
      "Start by clarifying requirements: read:write ratio (heavily read-skewed), latency target, whether custom aliases and expiry are needed, and analytics. Capacity: 100M/month is roughly 40 writes/second average with peaks several times that, and reads perhaps 100× writes. For IDs, avoid hashing the URL (collisions need a resolution loop); prefer a counter converted to base62, which gives 7 characters for ~3.5 trillion values. Distribute the counter with per-node ranges from a coordinator, or use a Snowflake-style ID, to avoid a single-writer bottleneck. Storage: a simple key-value mapping short code → long URL, which is a good fit for a KV store or a partitioned relational table keyed on the short code; no joins are needed. Put a cache in front for the read path, since access is heavily skewed to recent and popular links. Redirects should be HTTP 301 for permanence or 302 if you need to keep counting clicks. Mention rate limiting and malicious-URL scanning as real production concerns.",
    explanation:
      "Look for requirement clarification first, a real capacity estimate, the counter-vs-hash trade-off, and awareness that the read path dominates.",
    skillsTested: ["System design", "Scalability", "Trade-offs"],
    tags: ["system-design"],
    points: 5,
  },

  // --- Added so every technical category reaches the three option-based
  // --- questions `seedAssessments` needs before it will build an assessment.
  // --- Original content, written for this project from standard fundamentals.
  {
    text: "In a language with single inheritance, what problem does composition most directly avoid?",
    category: "OOP",
    topic: "Composition and inheritance",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      T("Coupling a subclass to implementation details of its parent that may change"),
      F("The need to write interfaces at all"),
      F("Having to allocate objects on the heap"),
      F("Method name collisions, which the compiler always resolves anyway"),
    ],
    explanation:
      "Inheritance exposes a subclass to its parent's internals: a change in the parent's protected state or call order can silently break it, which is the fragile base class problem. Composition depends only on a public interface, so the collaborator can change internally without affecting its user.",
    skillsTested: ["Object-oriented design", "Coupling"],
    tags: ["oop", "composition", "inheritance"],
  },
  {
    text: "A deadlock requires mutual exclusion, hold-and-wait, no preemption and circular wait to all hold at once.",
    category: "OPERATING_SYSTEMS",
    topic: "Deadlock",
    difficulty: "MEDIUM",
    type: "TRUE_FALSE",
    options: [T("True"), F("False")],
    explanation:
      "These are Coffman's four necessary conditions. Because all four must hold simultaneously, deadlock prevention works by denying any one of them — for example imposing a global lock ordering removes the possibility of circular wait.",
    skillsTested: ["Deadlock", "Concurrency"],
    tags: ["os", "deadlock", "concurrency"],
  },
  {
    text: "Why does TCP use a three-way handshake rather than a two-way exchange?",
    category: "COMPUTER_NETWORKS",
    topic: "TCP",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      T("So both sides confirm each other's initial sequence number before any data is sent"),
      F("To encrypt the connection before data transfer begins"),
      F("To let the client choose which port the server will listen on"),
      F("To measure available bandwidth before sending"),
    ],
    explanation:
      "Each side must learn and acknowledge the other's starting sequence number, which is what lets both detect loss, reordering and duplicates from an earlier connection. A two-way exchange would leave the initiator's sequence number unacknowledged. TCP provides no encryption — that is TLS running above it.",
    skillsTested: ["TCP", "Protocol design"],
    tags: ["networks", "tcp", "handshake"],
  },
  {
    text: "In Java, what is the practical difference between declaring a field `final` and declaring it `volatile`?",
    category: "JAVA",
    topic: "Concurrency and immutability",
    difficulty: "HARD",
    type: "MCQ",
    options: [
      T("`final` prevents reassignment after construction; `volatile` allows reassignment but makes each write visible to other threads"),
      F("Both prevent reassignment, but `volatile` also makes the field thread-safe"),
      F("`final` applies to primitives and `volatile` only to object references"),
      F("`volatile` prevents reassignment and `final` only hints at it to the compiler"),
    ],
    explanation:
      "They solve different problems. `final` is about identity — the reference cannot be reassigned, though a mutable object it points at can still change. `volatile` is about visibility and ordering: reads and writes are not reordered around it and a write is immediately visible to other threads, but it provides no atomicity for compound operations such as increment.",
    skillsTested: ["Java memory model", "Concurrency"],
    tags: ["java", "concurrency", "volatile"],
  },
  {
    text: "What does Python's Global Interpreter Lock prevent?",
    category: "PYTHON",
    topic: "Concurrency",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      T("Two threads in one CPython process executing Python bytecode at the same instant"),
      F("Multiple processes running Python code in parallel"),
      F("Any use of threads in Python at all"),
      F("Race conditions in Python programs, which the GIL makes impossible"),
    ],
    explanation:
      "The GIL serialises bytecode execution within a single CPython process, so threads give no speed-up on CPU-bound work — multiprocessing or a native extension does. Threads still help for I/O-bound work, because the GIL is released while waiting. It does not make code race-free: a compound operation can still be interleaved between bytecodes.",
    skillsTested: ["Python internals", "Concurrency"],
    tags: ["python", "gil", "concurrency"],
  },
  {
    text: "In JavaScript, `0.1 + 0.2 === 0.3` evaluates to false.",
    category: "JAVASCRIPT",
    topic: "Numbers",
    difficulty: "EASY",
    type: "TRUE_FALSE",
    options: [T("True"), F("False")],
    explanation:
      "JavaScript numbers are IEEE-754 doubles, and neither 0.1 nor 0.2 is exactly representable in binary, so the sum is very slightly above 0.3. Compare with a tolerance — `Math.abs(a - b) < Number.EPSILON` — or work in integers, for example counting paise rather than rupees.",
    skillsTested: ["Floating point", "JavaScript fundamentals"],
    tags: ["javascript", "numbers", "floating-point"],
  },
  {
    text: "Five friends sit in a row. Priya is not at either end. Rahul sits immediately to Priya's right. Only two people sit to the left of Priya. Which position does Rahul occupy, counting from the left?",
    category: "LOGICAL_REASONING",
    topic: "Seating arrangement",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [F("Second"), F("Third"), T("Fourth"), F("Fifth")],
    explanation:
      "Two people sit to Priya's left, so Priya is third. Rahul is immediately to her right, which is the fourth position. This is consistent with Priya not being at either end.",
    skillsTested: ["Logical reasoning", "Arrangement"],
    tags: ["reasoning", "seating"],
  },
  {
    text: "A read-heavy service adds a cache in front of its database. Which problem does a cache introduce that the database alone did not have?",
    category: "SYSTEM_DESIGN",
    topic: "Caching",
    difficulty: "MEDIUM",
    type: "MCQ",
    options: [
      T("Two copies of the same data that can disagree, so staleness has to be managed"),
      F("Higher read latency, since every read now takes two network hops"),
      F("Loss of durability, because caches cannot be persisted"),
      F("Inability to scale reads horizontally"),
    ],
    explanation:
      "A cache is a second copy, so correctness now depends on invalidation: a TTL bounds how stale a read can be, and write-through or explicit invalidation narrows the window further. Reads normally get faster, not slower, because the cache is checked first and the database is only consulted on a miss.",
    skillsTested: ["Caching", "System design trade-offs"],
    tags: ["system-design", "caching", "consistency"],
  },
  {
    text: "Which statement about horizontal and vertical scaling is correct?",
    category: "SYSTEM_DESIGN",
    topic: "Scaling",
    difficulty: "EASY",
    type: "MCQ",
    options: [
      T("Vertical scaling needs no change to application design but has a hard ceiling; horizontal scaling has no such ceiling but requires the application to tolerate more than one instance"),
      F("Horizontal scaling is always cheaper than vertical scaling at every size"),
      F("Vertical scaling removes the single point of failure that horizontal scaling creates"),
      F("Only stateless applications can be scaled vertically"),
    ],
    explanation:
      "Vertical scaling — a bigger machine — is the simpler first move precisely because the application does not change, but it stops at the largest instance available and leaves one machine to lose. Horizontal scaling removes that ceiling and that single point of failure, at the cost of needing shared session state, coordination and a load balancer.",
    skillsTested: ["Scalability", "System design trade-offs"],
    tags: ["system-design", "scaling"],
  },
];

import type { QuestionCategory } from "@prisma/client";

/**
 * The skill dependency graph.
 *
 * This is DATA, not code — it is seeded into `SkillNode` and everything else
 * (topic mapping, dashboard grouping, roadmap targeting) reads from it. Adding
 * a skill is one entry here plus a re-seed; no logic changes.
 *
 * `key` is the stable identifier used by `SkillObservation.skillKey`, so keys
 * must never be renamed once observations exist.
 */

export type SkillDefinition = {
  key: string;
  label: string;
  category: QuestionCategory;
  parentKey?: string;
  description?: string;
  /** Free-text patterns that map an arbitrary topic label onto this skill. */
  match?: RegExp[];
};

export const SKILL_GRAPH: SkillDefinition[] = [
  // ------------------------------------------------------------------- DSA
  { key: "dsa", label: "Data Structures & Algorithms", category: "DSA", description: "Core problem-solving toolkit." },
  { key: "dsa.arrays", label: "Arrays", category: "DSA", parentKey: "dsa", match: [/\barray|subarray|two pointer|prefix sum\b/i] },
  { key: "dsa.strings", label: "Strings", category: "DSA", parentKey: "dsa", match: [/\bstring|palindrome|substring|anagram\b/i] },
  { key: "dsa.hashing", label: "Hashing", category: "DSA", parentKey: "dsa", match: [/\bhash|hashmap|hash table|dictionary|map\b/i] },
  { key: "dsa.sorting", label: "Sorting", category: "DSA", parentKey: "dsa", match: [/\bsort|merge sort|quick sort|stability\b/i] },
  { key: "dsa.searching", label: "Searching", category: "DSA", parentKey: "dsa", match: [/\bbinary search|searching\b/i] },
  { key: "dsa.linked-lists", label: "Linked lists", category: "DSA", parentKey: "dsa", match: [/\blinked list|node pointer\b/i] },
  { key: "dsa.stacks-queues", label: "Stacks & queues", category: "DSA", parentKey: "dsa", match: [/\bstack|queue|deque|monotonic\b/i] },
  { key: "dsa.trees", label: "Trees", category: "DSA", parentKey: "dsa", match: [/\btree|bst|binary search tree|traversal|heap\b/i] },
  { key: "dsa.graphs", label: "Graphs", category: "DSA", parentKey: "dsa", match: [/\bgraph|bfs|dfs|dijkstra|shortest path|topological\b/i] },
  { key: "dsa.dp", label: "Dynamic programming", category: "DSA", parentKey: "dsa", match: [/\bdynamic programming|\bdp\b|memoi|tabulation|knapsack\b/i] },
  { key: "dsa.greedy", label: "Greedy", category: "DSA", parentKey: "dsa", match: [/\bgreedy\b/i] },
  { key: "dsa.complexity", label: "Complexity analysis", category: "DSA", parentKey: "dsa", match: [/\bcomplexity|big-?o|amortis|amortiz|time and space\b/i] },
  { key: "dsa.sliding-window", label: "Sliding window", category: "DSA", parentKey: "dsa", match: [/\bsliding window|window\b/i] },

  // ------------------------------------------------------------------ DBMS
  { key: "dbms", label: "Databases", category: "DBMS", description: "Relational data modelling and query behaviour." },
  { key: "dbms.sql", label: "SQL", category: "DBMS", parentKey: "dbms", match: [/\bsql|query|select|group by\b/i] },
  { key: "dbms.joins", label: "SQL joins", category: "DBMS", parentKey: "dbms", match: [/\bjoin|inner join|outer join|left join\b/i] },
  { key: "dbms.normalization", label: "Normalisation", category: "DBMS", parentKey: "dbms", match: [/\bnormal|normalis|normaliz|\b[123]nf\b|bcnf|functional dependenc\b/i] },
  { key: "dbms.indexing", label: "Indexing", category: "DBMS", parentKey: "dbms", match: [/\bindex|b-?tree index|clustered\b/i] },
  { key: "dbms.transactions", label: "Transactions", category: "DBMS", parentKey: "dbms", match: [/\btransaction|acid|isolation|commit|rollback|deadlock detection\b/i] },
  { key: "dbms.nosql", label: "NoSQL", category: "DBMS", parentKey: "dbms", match: [/\bnosql|mongo|document store|key-?value store\b/i] },

  // ------------------------------------------------------------------- OOP
  { key: "oop", label: "Object-oriented programming", category: "OOP" },
  { key: "oop.principles", label: "OOP principles", category: "OOP", parentKey: "oop", match: [/\bencapsulat|abstraction|inheritance|polymorph\b/i] },
  { key: "oop.solid", label: "SOLID", category: "OOP", parentKey: "oop", match: [/\bsolid|liskov|single responsibility|open\/closed|dependency inversion\b/i] },
  { key: "oop.design-patterns", label: "Design patterns", category: "OOP", parentKey: "oop", match: [/\bdesign pattern|singleton|factory|observer|strategy pattern\b/i] },

  // ------------------------------------------------------- Operating systems
  { key: "os", label: "Operating systems", category: "OPERATING_SYSTEMS" },
  { key: "os.processes", label: "Processes & threads", category: "OPERATING_SYSTEMS", parentKey: "os", match: [/\bprocess|thread|context switch|fork\b/i] },
  { key: "os.scheduling", label: "CPU scheduling", category: "OPERATING_SYSTEMS", parentKey: "os", match: [/\bschedul|round robin|sjf|starvation\b/i] },
  { key: "os.concurrency", label: "Concurrency", category: "OPERATING_SYSTEMS", parentKey: "os", match: [/\bconcurren|mutex|semaphore|race condition|deadlock\b/i] },
  { key: "os.memory", label: "Memory management", category: "OPERATING_SYSTEMS", parentKey: "os", match: [/\bmemory|paging|virtual memory|thrashing|segmentation\b/i] },

  // ------------------------------------------------------ Computer networks
  { key: "networks", label: "Computer networks", category: "COMPUTER_NETWORKS" },
  { key: "networks.osi", label: "OSI & TCP/IP model", category: "COMPUTER_NETWORKS", parentKey: "networks", match: [/\bosi|layer|tcp\/ip model\b/i] },
  { key: "networks.tcp", label: "TCP", category: "COMPUTER_NETWORKS", parentKey: "networks", match: [/\btcp|handshake|three-?way|congestion\b/i] },
  { key: "networks.udp", label: "UDP", category: "COMPUTER_NETWORKS", parentKey: "networks", match: [/\budp|datagram\b/i] },
  { key: "networks.http", label: "HTTP & DNS", category: "COMPUTER_NETWORKS", parentKey: "networks", match: [/\bhttp|https|dns|rest\b/i] },

  // --------------------------------------------------------- System design
  { key: "system-design", label: "System design", category: "SYSTEM_DESIGN" },
  { key: "system-design.apis", label: "API design", category: "SYSTEM_DESIGN", parentKey: "system-design", match: [/\bapi design|rest api|graphql|endpoint\b/i] },
  { key: "system-design.scalability", label: "Scalability", category: "SYSTEM_DESIGN", parentKey: "system-design", match: [/\bscalab|scale|horizontal|sharding|partition\b/i] },
  { key: "system-design.caching", label: "Caching", category: "SYSTEM_DESIGN", parentKey: "system-design", match: [/\bcache|caching|redis|cdn\b/i] },
  { key: "system-design.load-balancing", label: "Load balancing", category: "SYSTEM_DESIGN", parentKey: "system-design", match: [/\bload balanc|reverse proxy\b/i] },
  { key: "system-design.data-modelling", label: "Data modelling", category: "SYSTEM_DESIGN", parentKey: "system-design", match: [/\bdata model|schema design|cap theorem\b/i] },
  { key: "system-design.reliability", label: "Reliability", category: "SYSTEM_DESIGN", parentKey: "system-design", match: [/\bfailure|fault toleran|reliab|availab|replication\b/i] },

  // ------------------------------------------------------------- Languages
  { key: "lang.java", label: "Java", category: "JAVA", match: [/\bjava|jvm|spring|collections framework\b/i] },
  { key: "lang.python", label: "Python", category: "PYTHON", match: [/\bpython|gil|pandas|django|flask\b/i] },
  { key: "lang.javascript", label: "JavaScript", category: "JAVASCRIPT", match: [/\bjavascript|typescript|node|promise|closure|event loop|react\b/i] },

  // ------------------------------------------------------------- Aptitude
  { key: "aptitude", label: "Aptitude", category: "APTITUDE", match: [/\baptitude|arithmetic|percentage|ratio|profit|speed|time and work\b/i] },
  { key: "reasoning", label: "Logical reasoning", category: "LOGICAL_REASONING", match: [/\breasoning|syllogism|coding-?decoding|series|puzzle\b/i] },

  // ---------------------------------------------------- Soft / cross-cutting
  { key: "communication", label: "Communication", category: "HR", description: "Clarity, structure and concision when explaining." },
  { key: "behavioral", label: "Behavioural", category: "BEHAVIORAL", match: [/\bstar|behaviou?ral|teamwork|conflict|leadership|failure|deadline\b/i] },
  { key: "hr", label: "HR & motivation", category: "HR", match: [/\bmotivation|why this company|career goal|salary|strength|weakness|introduction\b/i] },
  { key: "problem-solving", label: "Problem solving", category: "DSA", description: "Approach, decomposition and trade-off reasoning." },
];

const BY_KEY = new Map(SKILL_GRAPH.map((skill) => [skill.key, skill]));

export function getSkill(key: string): SkillDefinition | undefined {
  return BY_KEY.get(key);
}

export function skillLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Root-level skills — the twelve headline areas shown on the dashboard. */
export const ROOT_SKILL_KEYS = SKILL_GRAPH.filter(
  (skill) => !skill.parentKey,
).map((skill) => skill.key);

export function childrenOf(key: string): SkillDefinition[] {
  return SKILL_GRAPH.filter((skill) => skill.parentKey === key);
}

/** Walks up to the root, e.g. "dsa.graphs" → ["dsa.graphs", "dsa"]. */
export function ancestorsOf(key: string): string[] {
  const chain: string[] = [];
  let current = BY_KEY.get(key);
  while (current) {
    chain.push(current.key);
    current = current.parentKey ? BY_KEY.get(current.parentKey) : undefined;
  }
  return chain;
}

/**
 * Maps a free-text topic label onto the most specific matching skill.
 *
 * Interview topics and question topics are author-written strings, so this is
 * the bridge between messy human labels and the stable skill graph. Leaf
 * skills are tried first so "SQL joins" resolves to `dbms.joins`, not `dbms`.
 */
export function resolveSkillKey(
  topic: string,
  category?: QuestionCategory | null,
): string | null {
  if (!topic?.trim()) return categoryFallback(category);
  const text = topic.trim();

  // Exact key or label match wins outright.
  const direct = SKILL_GRAPH.find(
    (skill) =>
      skill.key === text.toLowerCase() ||
      skill.label.toLowerCase() === text.toLowerCase(),
  );
  if (direct) return direct.key;

  // Leaves before roots: most specific match should win.
  const leaves = SKILL_GRAPH.filter((skill) => skill.parentKey);
  const roots = SKILL_GRAPH.filter((skill) => !skill.parentKey);

  for (const pool of [leaves, roots]) {
    // Prefer a match inside the declared category when one is supplied.
    const ordered = category
      ? [...pool].sort((a, b) => {
          const aHit = a.category === category ? 0 : 1;
          const bHit = b.category === category ? 0 : 1;
          return aHit - bHit;
        })
      : pool;

    for (const skill of ordered) {
      if (skill.match?.some((pattern) => pattern.test(text))) return skill.key;
    }
  }

  return categoryFallback(category);
}

function categoryFallback(category?: QuestionCategory | null): string | null {
  if (!category) return null;
  const root = SKILL_GRAPH.find(
    (skill) => !skill.parentKey && skill.category === category,
  );
  return root?.key ?? null;
}

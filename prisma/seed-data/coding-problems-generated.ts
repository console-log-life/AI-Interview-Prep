import type { Difficulty } from "@prisma/client";

/**
 * Development seed coding problems.
 *
 * Original exercises written for this project. Classic algorithmic ideas,
 * stated in our own words with our own titles, examples and test data —
 * nothing is copied or paraphrased from any problem site.
 *
 * Every problem reads from stdin and writes to stdout, so it runs on any
 * sandbox without a language-specific test harness.
 *
 * GENERATED FILE. Every `expected` value here was produced by executing a
 * reference solution against the matching input, so a test case cannot
 * disagree with a correct answer. Edit the generator, not this file.
 */

type GeneratedTestCase = {
  input: string;
  expected: string;
  isSample: boolean;
  explanation?: string;
};

type GeneratedProblem = {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  topic: string;
  tags: string[];
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  starterCode: Record<"PYTHON" | "JAVA" | "CPP" | "JAVASCRIPT", string>;
  testCases: GeneratedTestCase[];
};

export const GENERATED_PROBLEMS: GeneratedProblem[] = [
  {
    slug: "running-maximum",
    title: "Running Maximum",
    description: "For each position in a list of integers, report the largest value seen from the start of the list up to and including that position.\n\nThe result therefore has exactly as many values as the input, and never decreases from left to right.",
    difficulty: "EASY",
    topic: "Arrays",
    tags: ["array", "prefix"],
    constraints: "1 <= n <= 200000\n-1000000000 <= arr[i] <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "n space-separated integers: the running maximum at each position.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n3 1 4 1 5",
        expected: "3 3 4 4 5",
        isSample: true,
        explanation: "The best so far goes 3, 3, 4, 4, 5.",
      },
      {
        input: "4\n-2 -5 -1 -9",
        expected: "-2 -2 -1 -1",
        isSample: true,
        explanation: "All negative: the best so far goes -2, -2, -1, -1.",
      },
      {
        input: "1\n7",
        expected: "7",
        isSample: false,
      },
      {
        input: "1\n-1000000000",
        expected: "-1000000000",
        isSample: false,
      },
      {
        input: "3\n5 5 5",
        expected: "5 5 5",
        isSample: false,
      },
      {
        input: "6\n1 2 3 4 5 6",
        expected: "1 2 3 4 5 6",
        isSample: false,
      },
      {
        input: "6\n6 5 4 3 2 1",
        expected: "6 6 6 6 6 6",
        isSample: false,
      },
      {
        input: "7\n0 0 -1 0 1 0 2",
        expected: "0 0 0 0 1 1 2",
        isSample: false,
      },
      {
        input: "2\n1000000000 -1000000000",
        expected: "1000000000 1000000000",
        isSample: false,
      },
      {
        input: "8\n-3 7 -3 7 8 8 -100 9",
        expected: "-3 7 7 7 8 8 8 9",
        isSample: false,
      },
    ],
  },
  {
    slug: "second-distinct-largest",
    title: "Second Distinct Largest",
    description: "Find the second largest distinct value in a list of integers.\n\nRepeated values count once: in 9 9 4 the largest distinct value is 9 and the second is 4. If the list has fewer than two distinct values there is no answer.",
    difficulty: "EASY",
    topic: "Arrays",
    tags: ["array", "scanning"],
    constraints: "1 <= n <= 200000\n-1000000000 <= arr[i] <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "The second largest distinct value, or the word NONE if it does not exist.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n4 9 2 9 7",
        expected: "7",
        isSample: true,
        explanation: "Distinct values sorted high to low are 9, 7, 4, 2. The second is 7.",
      },
      {
        input: "3\n5 5 5",
        expected: "NONE",
        isSample: true,
        explanation: "Only one distinct value exists, so there is no second.",
      },
      {
        input: "1\n42",
        expected: "NONE",
        isSample: false,
      },
      {
        input: "2\n1 2",
        expected: "1",
        isSample: false,
      },
      {
        input: "2\n-7 -7",
        expected: "NONE",
        isSample: false,
      },
      {
        input: "4\n-1 -2 -3 -4",
        expected: "-2",
        isSample: false,
      },
      {
        input: "6\n1000000000 1000000000 999999999 1 2 3",
        expected: "999999999",
        isSample: false,
      },
      {
        input: "5\n0 0 0 0 1",
        expected: "0",
        isSample: false,
      },
      {
        input: "7\n-1000000000 1000000000 0 0 0 0 0",
        expected: "0",
        isSample: false,
      },
      {
        input: "8\n3 3 3 3 2 2 2 2",
        expected: "2",
        isSample: false,
      },
    ],
  },
  {
    slug: "shift-zeros-right",
    title: "Shift Zeros Right",
    description: "Move every zero in a list to the end, keeping the non-zero values in their original relative order.\n\nFor example 0 4 0 9 becomes 4 9 0 0: the 4 still comes before the 9, and both zeros are pushed to the back.",
    difficulty: "EASY",
    topic: "Two pointers",
    tags: ["array", "two-pointers"],
    constraints: "1 <= n <= 200000\n-1000000000 <= arr[i] <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "n space-separated integers in the rearranged order.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "4\n0 4 0 9",
        expected: "4 9 0 0",
        isSample: true,
        explanation: "4 and 9 keep their order; both zeros move to the end.",
      },
      {
        input: "5\n1 2 3 4 5",
        expected: "1 2 3 4 5",
        isSample: true,
        explanation: "No zeros, so nothing moves.",
      },
      {
        input: "1\n0",
        expected: "0",
        isSample: false,
      },
      {
        input: "1\n5",
        expected: "5",
        isSample: false,
      },
      {
        input: "3\n0 0 0",
        expected: "0 0 0",
        isSample: false,
      },
      {
        input: "6\n0 0 0 1 0 0",
        expected: "1 0 0 0 0 0",
        isSample: false,
      },
      {
        input: "5\n-1 0 -2 0 -3",
        expected: "-1 -2 -3 0 0",
        isSample: false,
      },
      {
        input: "4\n0 0 1 2",
        expected: "1 2 0 0",
        isSample: false,
      },
      {
        input: "7\n5 0 0 0 0 0 -5",
        expected: "5 -5 0 0 0 0 0",
        isSample: false,
      },
      {
        input: "8\n1 0 2 0 3 0 4 0",
        expected: "1 2 3 4 0 0 0 0",
        isSample: false,
      },
    ],
  },
  {
    slug: "first-unique-letter",
    title: "First Letter That Appears Once",
    description: "Given a word made of lowercase letters, find the position of the first letter that appears exactly once in the whole word.\n\nPositions are 0-based. If every letter repeats, there is no such position.",
    difficulty: "EASY",
    topic: "Strings",
    tags: ["string", "hash-map", "counting"],
    constraints: "1 <= length of s <= 200000\ns contains only lowercase English letters.",
    inputFormat: "A single line holding the word s.",
    outputFormat: "The 0-based position of the first letter occurring exactly once, or -1 if there is none.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    s = data[0] if data else \"\"\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String s = br.readLine();\n        if (s == null) s = \"\";\n        s = s.trim();\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    string s;\n    cin >> s;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst s = data[0] ?? \"\";\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "programming",
        expected: "0",
        isSample: true,
        explanation: "p appears once and is at position 0.",
      },
      {
        input: "aabbcc",
        expected: "-1",
        isSample: true,
        explanation: "Every letter appears twice, so there is no answer.",
      },
      {
        input: "a",
        expected: "0",
        isSample: false,
      },
      {
        input: "aa",
        expected: "-1",
        isSample: false,
      },
      {
        input: "abcabd",
        expected: "2",
        isSample: false,
      },
      {
        input: "zzzzzy",
        expected: "5",
        isSample: false,
      },
      {
        input: "swiss",
        expected: "1",
        isSample: false,
      },
      {
        input: "aabbc",
        expected: "4",
        isSample: false,
      },
      {
        input: "abba",
        expected: "-1",
        isSample: false,
      },
      {
        input: "xxyyzzw",
        expected: "6",
        isSample: false,
      },
    ],
  },
  {
    slug: "pairs-with-difference",
    title: "Count Value Pairs With a Given Gap",
    description: "Count how many distinct pairs of values in a list differ by exactly k.\n\nA pair is counted by its values, not its positions, so duplicates in the list never produce extra pairs. When k is 0 a pair means a value that appears at least twice.",
    difficulty: "EASY",
    topic: "Hashing",
    tags: ["array", "hash-map"],
    constraints: "1 <= n <= 200000\n-1000000000 <= arr[i] <= 1000000000\n0 <= k <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.\nLine 3: the gap k.",
    outputFormat: "A single integer: the number of distinct value pairs differing by exactly k.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n    k = int(data[1 + n])\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n        in.nextToken();\n        long k = (long) in.nval;\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    long long k;\n    cin >> k;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\nconst k = Number(data[1 + n]);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n1 5 3 4 2\n2",
        expected: "3",
        isSample: true,
        explanation: "The pairs are (1,3), (2,4) and (3,5), so the answer is 3.",
      },
      {
        input: "4\n8 8 3 3\n0",
        expected: "2",
        isSample: true,
        explanation: "With k = 0 we count values appearing twice: 8 and 3, so 2.",
      },
      {
        input: "1\n7\n1",
        expected: "0",
        isSample: false,
      },
      {
        input: "1\n7\n0",
        expected: "0",
        isSample: false,
      },
      {
        input: "3\n1 1 1\n0",
        expected: "1",
        isSample: false,
      },
      {
        input: "4\n-5 -3 -1 1\n2",
        expected: "3",
        isSample: false,
      },
      {
        input: "5\n1 2 3 4 5\n10",
        expected: "0",
        isSample: false,
      },
      {
        input: "6\n1000000000 0 -1000000000 1 2 3\n1000000000",
        expected: "2",
        isSample: false,
      },
      {
        input: "6\n4 4 4 4 4 4\n0",
        expected: "1",
        isSample: false,
      },
      {
        input: "8\n10 20 30 40 50 60 70 80\n10",
        expected: "7",
        isSample: false,
      },
    ],
  },
  {
    slug: "merge-two-sorted",
    title: "Merge Two Sorted Lists",
    description: "Two lists of integers are each already sorted in non-decreasing order. Combine them into one sorted list containing every value from both.\n\nDuplicates are kept: if a value appears in both lists it appears twice in the result. Either list may be empty.",
    difficulty: "EASY",
    topic: "Two pointers",
    tags: ["array", "two-pointers", "sorting"],
    constraints: "0 <= n, m <= 100000\n-1000000000 <= values <= 1000000000\nBoth input lists are sorted in non-decreasing order.",
    inputFormat: "Line 1: n, the length of the first list.\nLine 2: n space-separated integers (omitted when n is 0).\nLine 3: m, the length of the second list.\nLine 4: m space-separated integers (omitted when m is 0).",
    outputFormat: "n + m space-separated integers in non-decreasing order. Print an empty line when both lists are empty.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    a = [int(x) for x in data[1:1 + n]]\n    m = int(data[1 + n])\n    b = [int(x) for x in data[2 + n:2 + n + m]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] a = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            a[i] = (long) in.nval;\n        }\n        in.nextToken();\n        int m = (int) in.nval;\n        long[] b = new long[m];\n        for (int i = 0; i < m; i++) {\n            in.nextToken();\n            b[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> a(n);\n    for (int i = 0; i < n; i++) cin >> a[i];\n    int m;\n    cin >> m;\n    vector<long long> b(m);\n    for (int i = 0; i < m; i++) cin >> b[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst a = data.slice(1, 1 + n).map(Number);\nconst m = Number(data[1 + n]);\nconst b = data.slice(2 + n, 2 + n + m).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "3\n1 4 7\n3\n2 4 9",
        expected: "1 2 4 4 7 9",
        isSample: true,
        explanation: "Taking the smaller head each time gives 1 2 4 4 7 9; the repeated 4 appears twice.",
      },
      {
        input: "0\n\n3\n5 6 7",
        expected: "5 6 7",
        isSample: true,
        explanation: "The first list is empty, so the result is just the second.",
      },
      {
        input: "0\n\n0\n",
        expected: "",
        isSample: false,
      },
      {
        input: "1\n5\n0\n",
        expected: "5",
        isSample: false,
      },
      {
        input: "0\n\n1\n-5",
        expected: "-5",
        isSample: false,
      },
      {
        input: "3\n1 1 1\n3\n1 1 1",
        expected: "1 1 1 1 1 1",
        isSample: false,
      },
      {
        input: "4\n-10 -5 0 5\n2\n-7 7",
        expected: "-10 -7 -5 0 5 7",
        isSample: false,
      },
      {
        input: "5\n1 2 3 4 5\n5\n6 7 8 9 10",
        expected: "1 2 3 4 5 6 7 8 9 10",
        isSample: false,
      },
      {
        input: "5\n6 7 8 9 10\n5\n1 2 3 4 5",
        expected: "1 2 3 4 5 6 7 8 9 10",
        isSample: false,
      },
      {
        input: "2\n-1000000000 1000000000\n2\n0 0",
        expected: "-1000000000 0 0 1000000000",
        isSample: false,
      },
    ],
  },
  {
    slug: "sorted-insert-position",
    title: "Where Does It Belong?",
    description: "A list of distinct integers is sorted in increasing order. Report the index at which the value k should be inserted so the list stays sorted.\n\nIf k is already present, report its index. If k is larger than everything, the answer is n. Indices are 0-based, and the list may be empty.",
    difficulty: "EASY",
    topic: "Binary search",
    tags: ["binary-search", "array"],
    constraints: "0 <= n <= 200000\n-1000000000 <= arr[i], k <= 1000000000\nThe input list is sorted in strictly increasing order.",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers in increasing order (omitted when n is 0).\nLine 3: the value k.",
    outputFormat: "A single 0-based index.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n    k = int(data[1 + n])\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n        in.nextToken();\n        long k = (long) in.nval;\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    long long k;\n    cin >> k;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\nconst k = Number(data[1 + n]);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n1 3 5 7 9\n6",
        expected: "3",
        isSample: true,
        explanation: "6 sits between 5 at index 2 and 7 at index 3, so it belongs at index 3.",
      },
      {
        input: "5\n1 3 5 7 9\n9",
        expected: "4",
        isSample: true,
        explanation: "9 is already present at index 4.",
      },
      {
        input: "0\n\n5",
        expected: "0",
        isSample: false,
      },
      {
        input: "1\n10\n5",
        expected: "0",
        isSample: false,
      },
      {
        input: "1\n10\n15",
        expected: "1",
        isSample: false,
      },
      {
        input: "1\n10\n10",
        expected: "0",
        isSample: false,
      },
      {
        input: "4\n-10 -5 0 5\n-100",
        expected: "0",
        isSample: false,
      },
      {
        input: "4\n-10 -5 0 5\n100",
        expected: "4",
        isSample: false,
      },
      {
        input: "6\n1 2 3 4 5 6\n1",
        expected: "0",
        isSample: false,
      },
      {
        input: "3\n-1000000000 0 1000000000\n-1",
        expected: "1",
        isSample: false,
      },
    ],
  },
  {
    slug: "collapse-digits",
    title: "Collapse the Digits",
    description: "Repeatedly replace a non-negative integer with the sum of its digits until a single digit remains.\n\nFor 9875: 9+8+7+5 = 29, then 2+9 = 11, then 1+1 = 2. Report the final digit and how many replacement rounds it took. A number that is already a single digit takes 0 rounds.",
    difficulty: "EASY",
    topic: "Math",
    tags: ["math", "digits", "simulation"],
    constraints: "0 <= n <= 10^18",
    inputFormat: "A single line holding the integer n.",
    outputFormat: "Two space-separated integers: the final single digit, and the number of rounds performed.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n        in.nextToken();\n        long n = (long) in.nval;\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    long long n;\n    cin >> n;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "9875",
        expected: "2 3",
        isSample: true,
        explanation: "9875 to 29 to 11 to 2 is three rounds, ending at 2.",
      },
      {
        input: "7",
        expected: "7 0",
        isSample: true,
        explanation: "Already a single digit, so zero rounds are needed.",
      },
      {
        input: "0",
        expected: "0 0",
        isSample: false,
      },
      {
        input: "9",
        expected: "9 0",
        isSample: false,
      },
      {
        input: "10",
        expected: "1 1",
        isSample: false,
      },
      {
        input: "99",
        expected: "9 2",
        isSample: false,
      },
      {
        input: "100",
        expected: "1 1",
        isSample: false,
      },
      {
        input: "999999999999999999",
        expected: "9 2",
        isSample: false,
      },
      {
        input: "1000000000000000000",
        expected: "1 1",
        isSample: false,
      },
      {
        input: "19",
        expected: "1 2",
        isSample: false,
      },
    ],
  },
  {
    slug: "total-set-bits",
    title: "Total One-Bits Up To N",
    description: "Write every integer from 1 to n in binary and count how many 1 bits there are in total.\n\nFor n = 4 the numbers are 1, 10, 11, 100, which contain 1 + 1 + 2 + 1 = 5 one-bits altogether.",
    difficulty: "EASY",
    topic: "Bit manipulation",
    tags: ["bit-manipulation", "math"],
    constraints: "0 <= n <= 100000",
    inputFormat: "A single line holding the integer n.",
    outputFormat: "A single integer: the total number of 1 bits across 1..n.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n        in.nextToken();\n        long n = (long) in.nval;\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    long long n;\n    cin >> n;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "4",
        expected: "5",
        isSample: true,
        explanation: "1, 10, 11 and 100 contribute 1 + 1 + 2 + 1 = 5 one-bits.",
      },
      {
        input: "1",
        expected: "1",
        isSample: true,
        explanation: "Only the number 1, which has a single one-bit.",
      },
      {
        input: "0",
        expected: "0",
        isSample: false,
      },
      {
        input: "2",
        expected: "2",
        isSample: false,
      },
      {
        input: "3",
        expected: "4",
        isSample: false,
      },
      {
        input: "7",
        expected: "12",
        isSample: false,
      },
      {
        input: "8",
        expected: "13",
        isSample: false,
      },
      {
        input: "15",
        expected: "32",
        isSample: false,
      },
      {
        input: "16",
        expected: "33",
        isSample: false,
      },
      {
        input: "100000",
        expected: "815030",
        isSample: false,
      },
    ],
  },
  {
    slug: "cyclic-rotation-check",
    title: "Is It a Rotation?",
    description: "Decide whether the second word can be obtained by rotating the first.\n\nA rotation moves some number of leading letters to the end without reordering anything else, so abcde can become cdeab. Rotating by zero counts, meaning a word is a rotation of itself.",
    difficulty: "EASY",
    topic: "Strings",
    tags: ["string", "rotation"],
    constraints: "1 <= length of each word <= 100000\nBoth words contain only lowercase English letters.",
    inputFormat: "Line 1: the first word.\nLine 2: the second word.",
    outputFormat: "YES if the second word is a rotation of the first, otherwise NO.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    a = data[0] if len(data) > 0 else \"\"\n    b = data[1] if len(data) > 1 else \"\"\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String a = br.readLine();\n        String b = br.readLine();\n        if (a == null) a = \"\";\n        if (b == null) b = \"\";\n        a = a.trim();\n        b = b.trim();\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    string a, b;\n    cin >> a >> b;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst a = data[0] ?? \"\";\nconst b = data[1] ?? \"\";\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "abcde\ncdeab",
        expected: "YES",
        isSample: true,
        explanation: "Moving ab from the front to the back turns abcde into cdeab.",
      },
      {
        input: "abcde\nabced",
        expected: "NO",
        isSample: true,
        explanation: "The last two letters are swapped, which no rotation can do.",
      },
      {
        input: "a\na",
        expected: "YES",
        isSample: false,
      },
      {
        input: "a\nb",
        expected: "NO",
        isSample: false,
      },
      {
        input: "ab\nba",
        expected: "YES",
        isSample: false,
      },
      {
        input: "aaaa\naaaa",
        expected: "YES",
        isSample: false,
      },
      {
        input: "abc\nabcd",
        expected: "NO",
        isSample: false,
      },
      {
        input: "abab\nbaba",
        expected: "YES",
        isSample: false,
      },
      {
        input: "xyz\nzxy",
        expected: "YES",
        isSample: false,
      },
      {
        input: "aab\naba",
        expected: "YES",
        isSample: false,
      },
    ],
  },
  {
    slug: "next-greater-value",
    title: "Next Bigger Value",
    description: "For each element of a list, find the first element to its right that is strictly larger than it.\n\nIf no element to the right is larger, report -1 for that position. The answer has one value per input element.",
    difficulty: "EASY",
    topic: "Stacks",
    tags: ["stack", "array", "monotonic-stack"],
    constraints: "1 <= n <= 200000\n-1000000000 <= arr[i] <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "n space-separated integers: the next strictly larger value for each position, or -1.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n2 7 3 5 1",
        expected: "7 -1 5 -1 -1",
        isSample: true,
        explanation: "After 2 comes 7; after 7 nothing is larger; after 3 comes 5; after 5 nothing; after 1 nothing.",
      },
      {
        input: "4\n4 3 2 1",
        expected: "-1 -1 -1 -1",
        isSample: true,
        explanation: "The list only decreases, so no element has a larger one to its right.",
      },
      {
        input: "1\n5",
        expected: "-1",
        isSample: false,
      },
      {
        input: "2\n1 2",
        expected: "2 -1",
        isSample: false,
      },
      {
        input: "2\n2 1",
        expected: "-1 -1",
        isSample: false,
      },
      {
        input: "4\n3 3 3 3",
        expected: "-1 -1 -1 -1",
        isSample: false,
      },
      {
        input: "5\n1 2 3 4 5",
        expected: "2 3 4 5 -1",
        isSample: false,
      },
      {
        input: "5\n-5 -4 -3 -2 -1",
        expected: "-4 -3 -2 -1 -1",
        isSample: false,
      },
      {
        input: "6\n1 3 2 4 3 5",
        expected: "3 4 4 5 5 -1",
        isSample: false,
      },
      {
        input: "3\n-1000000000 0 1000000000",
        expected: "0 1000000000 -1",
        isSample: false,
      },
    ],
  },
  {
    slug: "best-window-sum",
    title: "Best Block of K",
    description: "Among all blocks of exactly k consecutive elements, find the one with the largest total.\n\nValues may be negative, so the best block is not simply the one with the largest element. If the list is shorter than k, no such block exists.",
    difficulty: "EASY",
    topic: "Sliding window",
    tags: ["sliding-window", "array"],
    constraints: "1 <= n <= 200000\n1 <= k <= 200000\n-1000000000 <= arr[i] <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.\nLine 3: the block length k.",
    outputFormat: "The largest total of any k consecutive elements, or the word IMPOSSIBLE if k exceeds n.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n    k = int(data[1 + n])\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n        in.nextToken();\n        long k = (long) in.nval;\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    long long k;\n    cin >> k;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\nconst k = Number(data[1 + n]);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "6\n1 -2 5 3 -1 4\n3",
        expected: "7",
        isSample: true,
        explanation: "The block 5 3 -1 totals 7, which beats every other block of three.",
      },
      {
        input: "3\n1 2 3\n5",
        expected: "IMPOSSIBLE",
        isSample: true,
        explanation: "Only three elements exist, so a block of five cannot be formed.",
      },
      {
        input: "1\n5\n1",
        expected: "5",
        isSample: false,
      },
      {
        input: "1\n-5\n1",
        expected: "-5",
        isSample: false,
      },
      {
        input: "4\n-1 -2 -3 -4\n2",
        expected: "-3",
        isSample: false,
      },
      {
        input: "5\n2 2 2 2 2\n5",
        expected: "10",
        isSample: false,
      },
      {
        input: "5\n1 2 3 4 5\n1",
        expected: "5",
        isSample: false,
      },
      {
        input: "6\n-10 20 -10 20 -10 20\n2",
        expected: "10",
        isSample: false,
      },
      {
        input: "3\n1000000000 1000000000 1000000000\n3",
        expected: "3000000000",
        isSample: false,
      },
      {
        input: "8\n4 -1 2 1 -5 4 3 -2\n4",
        expected: "6",
        isSample: false,
      },
    ],
  },
  {
    slug: "list-middle-value",
    title: "Middle of the Chain",
    description: "A singly linked chain is given as its values in order, from head to tail. Report the value stored in the middle node.\n\nWhen the chain has an even number of nodes there are two middle nodes; report the second of them. A chain of one node is its own middle.",
    difficulty: "EASY",
    topic: "Linked lists",
    tags: ["linked-list", "two-pointers"],
    constraints: "1 <= n <= 200000\n-1000000000 <= value <= 1000000000",
    inputFormat: "Line 1: n, the number of nodes.\nLine 2: n space-separated node values, from head to tail.",
    outputFormat: "The value at the middle node.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n10 20 30 40 50",
        expected: "30",
        isSample: true,
        explanation: "Five nodes, so the middle is the third: 30.",
      },
      {
        input: "4\n1 2 3 4",
        expected: "3",
        isSample: true,
        explanation: "Four nodes have two middles, 2 and 3; the second one is 3.",
      },
      {
        input: "1\n7",
        expected: "7",
        isSample: false,
      },
      {
        input: "2\n1 2",
        expected: "2",
        isSample: false,
      },
      {
        input: "3\n-1 -2 -3",
        expected: "-2",
        isSample: false,
      },
      {
        input: "6\n1 1 1 1 1 1",
        expected: "1",
        isSample: false,
      },
      {
        input: "7\n1 2 3 4 5 6 7",
        expected: "4",
        isSample: false,
      },
      {
        input: "8\n8 7 6 5 4 3 2 1",
        expected: "4",
        isSample: false,
      },
      {
        input: "2\n-1000000000 1000000000",
        expected: "1000000000",
        isSample: false,
      },
      {
        input: "9\n0 0 0 0 9 0 0 0 0",
        expected: "9",
        isSample: false,
      },
    ],
  },
  {
    slug: "tree-depth-array-form",
    title: "How Deep Is the Tree?",
    description: "A binary tree is stored in an array: position 0 holds the root, and the children of position i are at positions 2i+1 and 2i+2. The value -1 marks a missing node.\n\nReport the depth of the tree, counting nodes along the longest path from the root downwards. An empty tree has depth 0 and a single root has depth 1.",
    difficulty: "EASY",
    topic: "Trees",
    tags: ["tree", "recursion", "dfs"],
    constraints: "1 <= n <= 100000\nValues are -1 (missing) or 0 <= value <= 1000000000\nA missing node never has present children.",
    inputFormat: "Line 1: n, the length of the array.\nLine 2: n space-separated values, where -1 means no node.",
    outputFormat: "A single integer: the depth of the tree.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "7\n1 2 3 4 5 -1 -1",
        expected: "3",
        isSample: true,
        explanation: "The path 1 to 2 to 4 visits three nodes, and nothing is deeper.",
      },
      {
        input: "1\n-1",
        expected: "0",
        isSample: true,
        explanation: "The root is missing, so the tree is empty.",
      },
      {
        input: "1\n5",
        expected: "1",
        isSample: false,
      },
      {
        input: "3\n1 -1 -1",
        expected: "1",
        isSample: false,
      },
      {
        input: "3\n1 2 -1",
        expected: "2",
        isSample: false,
      },
      {
        input: "7\n1 2 3 -1 -1 -1 -1",
        expected: "2",
        isSample: false,
      },
      {
        input: "15\n1 2 3 4 5 6 7 8 9 10 11 12 13 14 15",
        expected: "4",
        isSample: false,
      },
      {
        input: "7\n0 0 0 0 0 0 0",
        expected: "3",
        isSample: false,
      },
      {
        input: "5\n1 2 -1 4 -1",
        expected: "3",
        isSample: false,
      },
      {
        input: "9\n1 -1 3 -1 -1 -1 7 -1 -1",
        expected: "3",
        isSample: false,
      },
    ],
  },
  {
    slug: "merge-overlapping-ranges",
    title: "Collapse Overlapping Ranges",
    description: "Given a set of closed ranges, combine every group that overlaps or touches into a single range.\n\nTwo ranges touch when one ends exactly where the next begins, and those also merge. Report the resulting ranges sorted by their start.",
    difficulty: "EASY",
    topic: "Intervals",
    tags: ["intervals", "sorting", "greedy"],
    constraints: "0 <= m <= 100000\n-1000000000 <= start <= end <= 1000000000\nThe first number n is unused and always equals m.",
    inputFormat: "Line 1: two integers n and m, both the number of ranges.\nNext m lines: two integers, the start and end of a range.",
    outputFormat: "Line 1: the number of ranges after merging.\nThen one line per range: its start and end.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    m = int(data[1])\n    pairs = []\n    for i in range(m):\n        u = int(data[2 + 2 * i])\n        v = int(data[3 + 2 * i])\n        pairs.append((u, v))\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        in.nextToken();\n        int m = (int) in.nval;\n        int[][] pairs = new int[m][2];\n        for (int i = 0; i < m; i++) {\n            in.nextToken();\n            pairs[i][0] = (int) in.nval;\n            in.nextToken();\n            pairs[i][1] = (int) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n, m;\n    cin >> n >> m;\n    vector<pair<int, int>> pairs(m);\n    for (int i = 0; i < m; i++) cin >> pairs[i].first >> pairs[i].second;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst m = Number(data[1]);\nconst pairs = [];\nfor (let i = 0; i < m; i++) {\n  pairs.push([Number(data[2 + 2 * i]), Number(data[3 + 2 * i])]);\n}\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "3 3\n1 4\n3 6\n8 10",
        expected: "2\n1 6\n8 10",
        isSample: true,
        explanation: "1-4 and 3-6 overlap and become 1-6; 8-10 stands alone.",
      },
      {
        input: "2 2\n1 2\n2 3",
        expected: "1\n1 3",
        isSample: true,
        explanation: "The ranges touch at 2, so they collapse into 1-3.",
      },
      {
        input: "0 0\n",
        expected: "0",
        isSample: false,
      },
      {
        input: "1 1\n5 5",
        expected: "1\n5 5",
        isSample: false,
      },
      {
        input: "2 2\n1 10\n2 3",
        expected: "1\n1 10",
        isSample: false,
      },
      {
        input: "2 2\n5 6\n1 2",
        expected: "2\n1 2\n5 6",
        isSample: false,
      },
      {
        input: "3 3\n1 1\n2 2\n3 3",
        expected: "3\n1 1\n2 2\n3 3",
        isSample: false,
      },
      {
        input: "4 4\n-10 -5\n-6 -1\n0 5\n5 9",
        expected: "2\n-10 -1\n0 9",
        isSample: false,
      },
      {
        input: "3 3\n1 1000000000\n-1000000000 0\n0 1",
        expected: "1\n-1000000000 1000000000",
        isSample: false,
      },
      {
        input: "5 5\n1 2\n1 2\n1 2\n1 2\n1 2",
        expected: "1\n1 2",
        isSample: false,
      },
    ],
  },
  {
    slug: "anagram-pair",
    title: "Same Letters, Different Order",
    description: "Decide whether two words use exactly the same letters the same number of times, regardless of order.\n\nLength alone is not enough: silent and listen qualify, but hello and world do not.",
    difficulty: "EASY",
    topic: "Hashing",
    tags: ["string", "hash-map", "counting"],
    constraints: "1 <= length of each word <= 100000\nBoth words contain only lowercase English letters.",
    inputFormat: "Line 1: the first word.\nLine 2: the second word.",
    outputFormat: "YES if the words use identical letter counts, otherwise NO.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    a = data[0] if len(data) > 0 else \"\"\n    b = data[1] if len(data) > 1 else \"\"\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String a = br.readLine();\n        String b = br.readLine();\n        if (a == null) a = \"\";\n        if (b == null) b = \"\";\n        a = a.trim();\n        b = b.trim();\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    string a, b;\n    cin >> a >> b;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst a = data[0] ?? \"\";\nconst b = data[1] ?? \"\";\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "listen\nsilent",
        expected: "YES",
        isSample: true,
        explanation: "Both words contain e, i, l, n, s and t exactly once.",
      },
      {
        input: "hello\nworld",
        expected: "NO",
        isSample: true,
        explanation: "hello has two l and no w, so the letter counts differ.",
      },
      {
        input: "a\na",
        expected: "YES",
        isSample: false,
      },
      {
        input: "a\nb",
        expected: "NO",
        isSample: false,
      },
      {
        input: "ab\nba",
        expected: "YES",
        isSample: false,
      },
      {
        input: "aab\nabb",
        expected: "NO",
        isSample: false,
      },
      {
        input: "abc\nabcd",
        expected: "NO",
        isSample: false,
      },
      {
        input: "aaaa\naaaa",
        expected: "YES",
        isSample: false,
      },
      {
        input: "xy\nyx",
        expected: "YES",
        isSample: false,
      },
      {
        input: "abcdefghij\njihgfedcba",
        expected: "YES",
        isSample: false,
      },
    ],
  },
  {
    slug: "majority-value",
    title: "Strict Majority",
    description: "Find the value that occupies more than half of the positions in a list.\n\nStrictly more than half: in a list of four elements a value must appear at least three times. Such a value may not exist.",
    difficulty: "EASY",
    topic: "Arrays",
    tags: ["array", "hash-map", "counting"],
    constraints: "1 <= n <= 200000\n-1000000000 <= arr[i] <= 1000000000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "The value holding a strict majority, or the word NONE if there is none.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n3 3 4 3 2",
        expected: "3",
        isSample: true,
        explanation: "3 appears three times out of five, which is more than half.",
      },
      {
        input: "4\n1 1 2 2",
        expected: "NONE",
        isSample: true,
        explanation: "Each value fills exactly half the list, and half is not more than half.",
      },
      {
        input: "1\n9",
        expected: "9",
        isSample: false,
      },
      {
        input: "2\n5 5",
        expected: "5",
        isSample: false,
      },
      {
        input: "2\n5 6",
        expected: "NONE",
        isSample: false,
      },
      {
        input: "3\n-1 -1 -1",
        expected: "-1",
        isSample: false,
      },
      {
        input: "7\n1 1 1 1 2 3 4",
        expected: "1",
        isSample: false,
      },
      {
        input: "6\n1 2 3 4 5 6",
        expected: "NONE",
        isSample: false,
      },
      {
        input: "5\n0 0 0 1 1",
        expected: "0",
        isSample: false,
      },
      {
        input: "3\n1000000000 1000000000 -1000000000",
        expected: "1000000000",
        isSample: false,
      },
    ],
  },
  {
    slug: "lonely-number",
    title: "The Unpaired One",
    description: "In a list of non-negative integers every value appears exactly twice, except one which appears once. Find that value.\n\nThe pairs are not necessarily next to each other, and the list is not sorted. Solving it without extra storage is the interesting part.",
    difficulty: "EASY",
    topic: "Bit manipulation",
    tags: ["bit-manipulation", "xor", "array"],
    constraints: "1 <= n <= 200000, n is odd\n0 <= arr[i] <= 1000000000\nEvery value appears twice except exactly one.",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "The single value that appears only once.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n4 1 2 1 2",
        expected: "4",
        isSample: true,
        explanation: "1 and 2 each appear twice; 4 is left over.",
      },
      {
        input: "1\n7",
        expected: "7",
        isSample: true,
        explanation: "A single element is by definition the unpaired one.",
      },
      {
        input: "3\n0 1 1",
        expected: "0",
        isSample: false,
      },
      {
        input: "3\n1 1 0",
        expected: "0",
        isSample: false,
      },
      {
        input: "5\n1000000000 5 5 7 7",
        expected: "1000000000",
        isSample: false,
      },
      {
        input: "7\n3 3 9 9 1 1 42",
        expected: "42",
        isSample: false,
      },
      {
        input: "9\n1 2 3 4 5 1 2 3 4",
        expected: "5",
        isSample: false,
      },
      {
        input: "5\n0 0 0 1 1",
        expected: "0",
        isSample: false,
      },
      {
        input: "3\n999999999 999999999 1",
        expected: "1",
        isSample: false,
      },
      {
        input: "7\n8 8 16 16 32 32 64",
        expected: "64",
        isSample: false,
      },
    ],
  },
  {
    slug: "stair-climb-ways",
    title: "Ways Up the Stairs",
    description: "A staircase has n steps. Each move climbs either one step or two steps. Count the distinct sequences of moves that reach the top.\n\nTwo sequences differ if the moves happen in a different order, so 1 then 2 is not the same as 2 then 1. There is exactly one way to climb zero steps: do nothing.\n\nBecause the count grows quickly, report it modulo 1000000007.",
    difficulty: "EASY",
    topic: "Dynamic programming",
    tags: ["dp", "dp-1d", "counting"],
    constraints: "0 <= n <= 1000000",
    inputFormat: "A single line holding the integer n.",
    outputFormat: "The number of distinct move sequences, modulo 1000000007.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n        in.nextToken();\n        long n = (long) in.nval;\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    long long n;\n    cin >> n;\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "4",
        expected: "5",
        isSample: true,
        explanation: "The five ways are 1111, 112, 121, 211 and 22.",
      },
      {
        input: "0",
        expected: "1",
        isSample: true,
        explanation: "Climbing nothing is a single valid sequence of no moves.",
      },
      {
        input: "1",
        expected: "1",
        isSample: false,
      },
      {
        input: "2",
        expected: "2",
        isSample: false,
      },
      {
        input: "3",
        expected: "3",
        isSample: false,
      },
      {
        input: "10",
        expected: "89",
        isSample: false,
      },
      {
        input: "45",
        expected: "836311896",
        isSample: false,
      },
      {
        input: "90",
        expected: "755204270",
        isSample: false,
      },
      {
        input: "1000",
        expected: "107579939",
        isSample: false,
      },
      {
        input: "1000000",
        expected: "534400663",
        isSample: false,
      },
    ],
  },
  {
    slug: "balance-point-index",
    title: "The Balancing Position",
    description: "Find a position where the values strictly to its left total the same as the values strictly to its right. The element at that position belongs to neither side.\n\nAn empty side totals 0, so position 0 qualifies when everything after it also totals 0. Report the smallest such position, or -1 if none exists.",
    difficulty: "EASY",
    topic: "Prefix sums",
    tags: ["prefix-sum", "array"],
    constraints: "1 <= n <= 200000\n-10000 <= arr[i] <= 10000",
    inputFormat: "Line 1: n, the number of elements.\nLine 2: n space-separated integers.",
    outputFormat: "The smallest balancing position, or -1 if there is none.",
    starterCode: {
      PYTHON: "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:1 + n]]\n\n    # Your code here\n\n\nsolve()\n",
      JAVA: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new InputStreamReader(System.in)));\n\n        in.nextToken();\n        int n = (int) in.nval;\n        long[] arr = new long[n];\n        for (int i = 0; i < n; i++) {\n            in.nextToken();\n            arr[i] = (long) in.nval;\n        }\n\n        // Your code here\n\n    }\n}\n",
      CPP: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    vector<long long> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n\n    // Your code here\n\n    return 0;\n}\n",
      JAVASCRIPT: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n\nconst n = Number(data[0]);\nconst arr = data.slice(1, 1 + n).map(Number);\n\n// Your code here\n\n",
    },
    testCases: [
      {
        input: "5\n1 7 3 6 2",
        expected: "2",
        isSample: true,
        explanation: "At position 2 the left side is 1+7=8 and the right side is 6+2=8, so the two sides balance.",
      },
      {
        input: "3\n1 2 3",
        expected: "-1",
        isSample: true,
        explanation: "No position splits the list into two equal halves.",
      },
      {
        input: "1\n0",
        expected: "0",
        isSample: false,
      },
      {
        input: "1\n5",
        expected: "0",
        isSample: false,
      },
      {
        input: "2\n0 0",
        expected: "0",
        isSample: false,
      },
      {
        input: "3\n0 0 0",
        expected: "0",
        isSample: false,
      },
      {
        input: "4\n-1 2 -1 0",
        expected: "1",
        isSample: false,
      },
      {
        input: "5\n2 0 0 0 2",
        expected: "1",
        isSample: false,
      },
      {
        input: "6\n1 2 3 4 5 6",
        expected: "-1",
        isSample: false,
      },
      {
        input: "5\n-10000 10000 0 10000 -10000",
        expected: "2",
        isSample: false,
      },
    ],
  },
];

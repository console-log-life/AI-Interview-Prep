import type { Difficulty } from "@prisma/client";

import { GENERATED_PROBLEMS } from "./coding-problems-generated";

/**
 * Development seed coding problems.
 *
 * Original classic-style exercises written for this project. Every problem
 * reads from stdin and writes to stdout so it works with any sandbox
 * (Judge0 and friends) without a language-specific test harness.
 */

export type SeedTestCase = {
  input: string;
  expected: string;
  isSample: boolean;
  explanation?: string;
};

export type SeedProblem = {
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
  testCases: SeedTestCase[];
};

/**
 * The five problems written by hand before the bank was expanded.
 *
 * Kept exactly as they were: the generator never emits these slugs, so
 * re-seeding updates them in place rather than replacing them.
 */
const HAND_WRITTEN_PROBLEMS: SeedProblem[] = [
  {
    slug: "two-sum-indices",
    title: "Two Sum",
    description: `Given an array of integers and a target value, find the two distinct positions whose values add up to the target.

Exactly one such pair exists. Report the two positions using 0-based indexing, smaller index first.`,
    difficulty: "EASY",
    topic: "Hashing",
    tags: ["array", "hash-map"],
    constraints: `2 <= n <= 100000
-1000000000 <= arr[i] <= 1000000000
-2000000000 <= target <= 2000000000
Exactly one valid pair exists.`,
    inputFormat: `Line 1: n, the number of elements.
Line 2: n space-separated integers.
Line 3: the target integer.`,
    outputFormat: `Two space-separated 0-based indices, smaller first.`,
    starterCode: {
      PYTHON: `import sys

def solve():
    data = sys.stdin.read().split()
    n = int(data[0])
    arr = [int(x) for x in data[1:1 + n]]
    target = int(data[1 + n])

    # Your code here


solve()
`,
      JAVA: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StreamTokenizer in = new StreamTokenizer(br);

        in.nextToken();
        int n = (int) in.nval;
        long[] arr = new long[n];
        for (int i = 0; i < n; i++) {
            in.nextToken();
            arr[i] = (long) in.nval;
        }
        in.nextToken();
        long target = (long) in.nval;

        // Your code here

    }
}
`,
      CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<long long> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    long long target;
    cin >> target;

    // Your code here

    return 0;
}
`,
      JAVASCRIPT: `const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);

const n = Number(data[0]);
const arr = data.slice(1, 1 + n).map(Number);
const target = Number(data[1 + n]);

// Your code here

`,
    },
    testCases: [
      {
        input: "4\n2 7 11 15\n9",
        expected: "0 1",
        isSample: true,
        explanation: "arr[0] + arr[1] = 2 + 7 = 9.",
      },
      {
        input: "3\n3 2 4\n6",
        expected: "1 2",
        isSample: true,
        explanation: "arr[1] + arr[2] = 2 + 4 = 6.",
      },
      { input: "2\n3 3\n6", expected: "0 1", isSample: false },
      { input: "5\n-1 -2 -3 -4 -5\n-8", expected: "2 4", isSample: false },
      {
        input: "6\n1000000000 1 2 3 4 1000000000\n2000000000",
        expected: "0 5",
        isSample: false,
      },
    ],
  },

  {
    slug: "reverse-words",
    title: "Reverse the Words",
    description: `Given a line of text, output the words in reverse order.

Words are separated by one or more spaces. Leading and trailing spaces must be removed, and the output must have exactly one space between words.`,
    difficulty: "EASY",
    topic: "Strings",
    tags: ["string", "parsing"],
    constraints: `1 <= length of line <= 10000
The line contains printable ASCII characters.`,
    inputFormat: `A single line of text.`,
    outputFormat: `The words in reverse order, single-spaced, with no leading or trailing space.`,
    starterCode: {
      PYTHON: `import sys

line = sys.stdin.readline().rstrip("\\n")

# Your code here
`,
      JAVA: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        if (line == null) line = "";

        // Your code here

    }
}
`,
      CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    string line;
    getline(cin, line);

    // Your code here

    return 0;
}
`,
      JAVASCRIPT: `const line = require("fs").readFileSync(0, "utf8").split("\\n")[0] ?? "";

// Your code here
`,
    },
    testCases: [
      {
        input: "the sky is blue",
        expected: "blue is sky the",
        isSample: true,
        explanation: "Four words, emitted in reverse order.",
      },
      {
        input: "  hello   world  ",
        expected: "world hello",
        isSample: true,
        explanation: "Extra spaces are collapsed and trimmed.",
      },
      { input: "single", expected: "single", isSample: false },
      { input: "a b c d e", expected: "e d c b a", isSample: false },
    ],
  },

  {
    slug: "balanced-brackets",
    title: "Balanced Brackets",
    description: `Given a string containing only the characters '(', ')', '{', '}', '[' and ']', decide whether the brackets are balanced.

Brackets are balanced when every opening bracket is closed by the matching type, and pairs are properly nested.`,
    difficulty: "MEDIUM",
    topic: "Stacks",
    tags: ["stack", "string"],
    constraints: `1 <= length of string <= 100000
The string contains only bracket characters.`,
    inputFormat: `A single line containing the bracket string.`,
    outputFormat: `YES if the brackets are balanced, otherwise NO.`,
    starterCode: {
      PYTHON: `import sys

s = sys.stdin.readline().strip()

# Your code here
`,
      JAVA: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String s = br.readLine();
        if (s == null) s = "";
        s = s.trim();

        // Your code here

    }
}
`,
      CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    getline(cin, s);

    // Your code here

    return 0;
}
`,
      JAVASCRIPT: `const s = require("fs").readFileSync(0, "utf8").trim();

// Your code here
`,
    },
    testCases: [
      {
        input: "()[]{}",
        expected: "YES",
        isSample: true,
        explanation: "Three independent, correctly closed pairs.",
      },
      {
        input: "([)]",
        expected: "NO",
        isSample: true,
        explanation: "The pairs interleave instead of nesting.",
      },
      { input: "{[()]}", expected: "YES", isSample: false },
      { input: "(", expected: "NO", isSample: false },
      { input: ")(", expected: "NO", isSample: false },
      { input: "(((((((((())))))))))", expected: "YES", isSample: false },
    ],
  },

  {
    slug: "max-subarray-sum",
    title: "Maximum Subarray Sum",
    description: `Given an array of integers, find the largest sum obtainable from any contiguous non-empty subarray.

The array may contain negative numbers; if every element is negative, the answer is the largest single element.`,
    difficulty: "MEDIUM",
    topic: "Dynamic programming",
    tags: ["array", "kadane", "dp"],
    constraints: `1 <= n <= 200000
-1000000 <= arr[i] <= 1000000`,
    inputFormat: `Line 1: n, the number of elements.
Line 2: n space-separated integers.`,
    outputFormat: `A single integer — the maximum subarray sum.`,
    starterCode: {
      PYTHON: `import sys

data = sys.stdin.read().split()
n = int(data[0])
arr = [int(x) for x in data[1:1 + n]]

# Your code here
`,
      JAVA: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        StreamTokenizer in = new StreamTokenizer(
            new BufferedReader(new InputStreamReader(System.in)));

        in.nextToken();
        int n = (int) in.nval;
        long[] arr = new long[n];
        for (int i = 0; i < n; i++) {
            in.nextToken();
            arr[i] = (long) in.nval;
        }

        // Your code here

    }
}
`,
      CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<long long> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];

    // Your code here

    return 0;
}
`,
      JAVASCRIPT: `const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);

const n = Number(data[0]);
const arr = data.slice(1, 1 + n).map(Number);

// Your code here
`,
    },
    testCases: [
      {
        input: "9\n-2 1 -3 4 -1 2 1 -5 4",
        expected: "6",
        isSample: true,
        explanation: "The subarray [4, -1, 2, 1] sums to 6.",
      },
      {
        input: "1\n-5",
        expected: "-5",
        isSample: true,
        explanation: "Only one element, and the subarray must be non-empty.",
      },
      { input: "5\n-3 -1 -4 -1 -5", expected: "-1", isSample: false },
      { input: "4\n1 2 3 4", expected: "10", isSample: false },
      { input: "6\n5 -9 6 -2 3 -1", expected: "7", isSample: false },
    ],
  },

  {
    slug: "count-distinct-window",
    title: "Distinct Elements in Every Window",
    description: `Given an array of n integers and a window size k, output the number of distinct elements in every contiguous window of size k, from left to right.

A naive solution recounts each window from scratch. Aim for a single pass.`,
    difficulty: "HARD",
    topic: "Sliding window",
    tags: ["sliding-window", "hash-map"],
    constraints: `1 <= k <= n <= 200000
-1000000000 <= arr[i] <= 1000000000`,
    inputFormat: `Line 1: n and k, space separated.
Line 2: n space-separated integers.`,
    outputFormat: `n - k + 1 space-separated integers on one line.`,
    starterCode: {
      PYTHON: `import sys

data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
arr = [int(x) for x in data[2:2 + n]]

# Your code here
`,
      JAVA: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        StreamTokenizer in = new StreamTokenizer(
            new BufferedReader(new InputStreamReader(System.in)));

        in.nextToken();
        int n = (int) in.nval;
        in.nextToken();
        int k = (int) in.nval;
        long[] arr = new long[n];
        for (int i = 0; i < n; i++) {
            in.nextToken();
            arr[i] = (long) in.nval;
        }

        // Your code here

    }
}
`,
      CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    cin >> n >> k;
    vector<long long> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];

    // Your code here

    return 0;
}
`,
      JAVASCRIPT: `const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);

const n = Number(data[0]);
const k = Number(data[1]);
const arr = data.slice(2, 2 + n).map(Number);

// Your code here
`,
    },
    testCases: [
      {
        input: "7 4\n1 2 1 3 4 2 3",
        expected: "3 4 4 3",
        isSample: true,
        explanation:
          "Windows: [1,2,1,3]→3, [2,1,3,4]→4, [1,3,4,2]→4, [3,4,2,3]→3.",
      },
      {
        input: "5 1\n1 1 1 1 1",
        expected: "1 1 1 1 1",
        isSample: true,
        explanation: "Every window of size 1 has exactly one distinct value.",
      },
      { input: "5 5\n1 2 3 4 5", expected: "5", isSample: false },
      { input: "6 3\n7 7 7 7 7 7", expected: "1 1 1 1", isSample: false },
      { input: "8 2\n1 2 2 3 3 3 4 5", expected: "2 1 2 1 1 2 2", isSample: false },
    ],
  },
];

/**
 * Everything the seed loads.
 *
 * The generated problems come from `coding-problems-generated.ts`, where every
 * expected output was produced by running a reference solution against its
 * input rather than typed by hand.
 */
export const SEED_PROBLEMS: SeedProblem[] = [
  ...HAND_WRITTEN_PROBLEMS,
  ...GENERATED_PROBLEMS,
];

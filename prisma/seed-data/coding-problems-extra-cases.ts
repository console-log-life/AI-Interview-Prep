/**
 * Extra hidden test cases for the five hand-written problems.
 *
 * Those five shipped with two or three hidden cases each, below the eight the
 * expanded bank holds itself to. Their statements are untouched — this only
 * adds cases, merged in by `coding-problems.ts`.
 *
 * GENERATED FILE. Every expected value was produced by running a reference
 * solution against the input. Edit the generator, not this file.
 */

export const EXTRA_TEST_CASES: Record<
  string,
  Array<{ input: string; expected: string; isSample: boolean }>
> = {
  "balanced-brackets": [
    {
      input: "",
      expected: "YES",
      isSample: false,
    },
    {
      input: "(",
      expected: "NO",
      isSample: false,
    },
    {
      input: ")",
      expected: "NO",
      isSample: false,
    },
    {
      input: "([{}])",
      expected: "YES",
      isSample: false,
    },
    {
      input: "([)]",
      expected: "NO",
      isSample: false,
    },
    {
      input: "{{{{}}}}",
      expected: "YES",
      isSample: false,
    },
  ],
  "count-distinct-window": [
    {
      input: "1 1\n5",
      expected: "1",
      isSample: false,
    },
    {
      input: "3 3\n7 7 7",
      expected: "1",
      isSample: false,
    },
    {
      input: "4 2\n1 1 2 2",
      expected: "1 2 1",
      isSample: false,
    },
    {
      input: "5 1\n1 2 3 4 5",
      expected: "1 1 1 1 1",
      isSample: false,
    },
    {
      input: "6 3\n1 2 3 1 2 3",
      expected: "3 3 3 3",
      isSample: false,
    },
    {
      input: "5 5\n9 9 9 9 1",
      expected: "2",
      isSample: false,
    },
  ],
  "max-subarray-sum": [
    {
      input: "1\n-5",
      expected: "-5",
      isSample: false,
    },
    {
      input: "1\n5",
      expected: "5",
      isSample: false,
    },
    {
      input: "3\n-1 -2 -3",
      expected: "-1",
      isSample: false,
    },
    {
      input: "5\n0 0 0 0 0",
      expected: "0",
      isSample: false,
    },
    {
      input: "4\n1000000000 1000000000 -1 1000000000",
      expected: "2999999999",
      isSample: false,
    },
    {
      input: "6\n-2 -3 4 -1 -2 5",
      expected: "6",
      isSample: false,
    },
  ],
  "reverse-words": [
    {
      input: "one",
      expected: "one",
      isSample: false,
    },
    {
      input: "  padded   out  ",
      expected: "out padded",
      isSample: false,
    },
    {
      input: "a b c d e",
      expected: "e d c b a",
      isSample: false,
    },
    {
      input: "trailing ",
      expected: "trailing",
      isSample: false,
    },
    {
      input: " leading",
      expected: "leading",
      isSample: false,
    },
    {
      input: "two  spaces  between",
      expected: "between spaces two",
      isSample: false,
    },
  ],
  "two-sum-indices": [
    {
      input: "2\n-1000000000 -1000000000\n-2000000000",
      expected: "0 1",
      isSample: false,
    },
    {
      input: "5\n0 0 1 2 3\n0",
      expected: "0 1",
      isSample: false,
    },
    {
      input: "4\n1 2 3 4\n7",
      expected: "2 3",
      isSample: false,
    },
    {
      input: "6\n5 5 5 5 5 1\n6",
      expected: "0 5",
      isSample: false,
    },
    {
      input: "3\n-5 0 5\n0",
      expected: "0 2",
      isSample: false,
    },
    {
      input: "7\n10 20 30 40 50 60 70\n110",
      expected: "4 5",
      isSample: false,
    },
  ],
};

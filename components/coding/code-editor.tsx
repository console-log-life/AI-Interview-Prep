"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { CodeLanguage } from "@/types/user";

// Monaco is ~2 MB — load it only on the client, only when a problem is open.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/30">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading editor…
      </span>
    </div>
  ),
});

const MONACO_LANGUAGE: Record<CodeLanguage, string> = {
  PYTHON: "python",
  JAVA: "java",
  CPP: "cpp",
  JAVASCRIPT: "javascript",
};

type CodeEditorProps = {
  language: CodeLanguage;
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
};

export function CodeEditor({
  language,
  value,
  onChange,
  height = "460px",
  readOnly = false,
}: CodeEditorProps) {
  const options = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 21,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      readOnly,
      padding: { top: 14, bottom: 14 },
      renderLineHighlight: "line" as const,
      smoothScrolling: true,
      cursorBlinking: "smooth" as const,
      bracketPairColorization: { enabled: true },
      // Keep Tab as an indent key so it doesn't trap keyboard users who are
      // trying to move focus out of the editor.
      tabFocusMode: false,
    }),
    [readOnly],
  );

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ height }}
      role="group"
      aria-label="Code editor"
    >
      <MonacoEditor
        height="100%"
        language={MONACO_LANGUAGE[language]}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        theme="vs-dark"
        options={options}
        loading={<Skeleton className="h-full w-full" />}
      />
    </div>
  );
}

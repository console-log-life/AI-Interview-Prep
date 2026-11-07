"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TagInputProps = {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  max?: number;
  describedBy?: string;
};

/**
 * Comma/Enter-separated tag entry for skills, target companies, etc.
 * Keyboard-complete: Enter or comma adds, Backspace on an empty field removes.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  max = 50,
  describedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const candidate = raw.trim().replace(/,$/, "");
    if (!candidate) return;
    if (value.length >= max) return;
    // Case-insensitive dedupe so "React" and "react" don't both land.
    if (value.some((tag) => tag.toLowerCase() === candidate.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, candidate]);
    setDraft("");
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = event.target.value;
          if (next.endsWith(",")) add(next);
          else setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          } else if (event.key === "Backspace" && !draft && value.length > 0) {
            remove(value.length - 1);
          }
        }}
        onBlur={() => add(draft)}
      />

      {value.length > 0 && (
        <ul className={cn("flex flex-wrap gap-1.5")}>
          {value.map((tag, index) => (
            <li key={`${tag}-${index}`}>
              <Badge variant="secondary" className="pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

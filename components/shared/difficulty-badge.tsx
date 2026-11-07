import { Badge } from "@/components/ui/badge";
import { humanizeEnum } from "@/lib/utils";

type Difficulty = "EASY" | "MEDIUM" | "HARD";

const VARIANT: Record<Difficulty, "success" | "warning" | "destructive"> = {
  EASY: "success",
  MEDIUM: "warning",
  HARD: "destructive",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <Badge variant={VARIANT[difficulty]}>{humanizeEnum(difficulty)}</Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return <Badge variant="secondary">{humanizeEnum(category)}</Badge>;
}

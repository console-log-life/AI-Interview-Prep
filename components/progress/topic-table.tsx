import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, humanizeEnum, scoreBand } from "@/lib/utils";

export type TopicRow = {
  id: string;
  topic: string;
  category: string;
  averageScore: number;
  bestScore: number;
  lastScore: number;
  totalAttempts: number;
  lastPracticedAt: Date;
};

const BAND_BAR = {
  weak: "bg-destructive",
  developing: "bg-warning",
  strong: "bg-success",
};

const BAND_LABEL = {
  weak: "Needs work",
  developing: "Developing",
  strong: "Strong",
} as const;

const BAND_VARIANT = {
  weak: "destructive",
  developing: "warning",
  strong: "success",
} as const;

export function TopicTable({ topics }: { topics: TopicRow[] }) {
  if (topics.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No topic data yet"
        description="Topic scores are recorded every time you complete an assessment, an interview or a coding submission."
        action={{ label: "Take an assessment", href: "/assessments" }}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Topic</TableHead>
          <TableHead className="hidden sm:table-cell">Category</TableHead>
          <TableHead>Average</TableHead>
          <TableHead className="hidden md:table-cell">Best</TableHead>
          <TableHead className="hidden md:table-cell">Last</TableHead>
          <TableHead className="hidden lg:table-cell">Attempts</TableHead>
          <TableHead className="hidden lg:table-cell">Last practised</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {topics.map((topic) => {
          const band = scoreBand(topic.averageScore);
          return (
            <TableRow key={topic.id}>
              <TableCell className="font-medium">{topic.topic}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant="secondary">{humanizeEnum(topic.category)}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress
                    value={topic.averageScore}
                    indicatorClassName={BAND_BAR[band]}
                    className="w-16"
                    aria-hidden="true"
                  />
                  <span className="tabular-nums">
                    {Math.round(topic.averageScore)}%
                  </span>
                  {/* Band is stated in text so it is not colour-only. */}
                  <Badge variant={BAND_VARIANT[band]} className="hidden xl:inline-flex">
                    {BAND_LABEL[band]}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">
                {Math.round(topic.bestScore)}%
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">
                {Math.round(topic.lastScore)}%
              </TableCell>
              <TableCell className="hidden tabular-nums lg:table-cell">
                {topic.totalAttempts}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {formatDate(topic.lastPracticedAt)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LineChart as LineChartIcon } from "lucide-react";

export type SnapshotPoint = {
  date: string;
  readiness: number;
  interview: number;
  assessment: number;
  coding: number;
};

const SERIES = [
  { key: "readiness", name: "Readiness", color: "hsl(var(--chart-1))" },
  { key: "interview", name: "Interviews", color: "hsl(var(--chart-2))" },
  { key: "assessment", name: "Assessments", color: "hsl(var(--chart-3))" },
  { key: "coding", name: "Coding", color: "hsl(var(--chart-4))" },
] as const;

/**
 * Historical progress.
 *
 * Points come from stored `ProgressSnapshot` rows written after each scored
 * activity — this chart is never seeded with sample data. Fewer than two real
 * points means there is no trend to draw, and we say so.
 */
export function ProgressChart({ data }: { data: SnapshotPoint[] }) {
  return (
    <Card className="rounded-2xl border-border/70">
      <CardHeader>
        <CardTitle>Progress over time</CardTitle>
        <CardDescription>
          One point per scored activity. Real history only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <EmptyState
            icon={LineChartIcon}
            title="Not enough history yet"
            description="Two or more scored activities are needed before a trend means anything. Keep practising and this fills in."
            action={{ label: "Start a mock interview", href: "/interview/new" }}
          />
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.8125rem",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "0.8125rem" }} />
                {SERIES.map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.name}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatUsd } from "@/lib/format";

/*
  The one chart in the product: estimated monthly cost across the models that can
  actually do the job. This is the comparison the page exists to make, so it earns
  its place; decorative charts do not.
*/

export interface CostDatum {
  name: string;
  cost: number;
  isPrimary: boolean;
}

export function CostChart({ data }: { data: CostDatum[] }) {
  if (data.length < 2) return null;

  const height = Math.max(140, data.length * 44);

  return (
    <figure className="mt-6">
      <figcaption className="font-mono text-caption text-mute">
        ESTIMATED MONTHLY COST — COMPATIBLE MODELS
      </figcaption>

      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={132}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#4d4d4d" }}
            />
            <Tooltip
              cursor={{ fill: "#f5f5f5" }}
              formatter={(value) => [
                typeof value === "number" ? formatUsd(value) : String(value ?? ""),
                "Monthly",
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #ebebeb",
                fontSize: 12,
              }}
            />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.isPrimary ? "#171717" : "#d4d4d4"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* The chart is decoration on top of this table, not a substitute for it. */}
      <table className="sr-only">
        <caption>Estimated monthly cost by model</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Estimated monthly cost</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.name}>
              <th scope="row">{entry.name}</th>
              <td>{formatUsd(entry.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

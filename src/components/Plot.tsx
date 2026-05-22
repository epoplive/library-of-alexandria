import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

type Datum = Record<string, number | string>;

interface PlotProps {
  data: Datum[];
  x: string;
  y: string | string[];
  kind?: 'line' | 'bar';
  caption?: string;
  height?: number;
  legend?: boolean;
}

const PALETTE = ['#5b21b6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

export function Plot({
  data,
  x,
  y,
  kind = 'line',
  caption,
  height = 280,
  legend = false,
}: PlotProps) {
  const ys = Array.isArray(y) ? y : [y];

  return (
    <figure className="my-6">
      <div className="rounded-2xl bg-paper-card border border-ink-subtle/15 p-4">
        <ResponsiveContainer width="100%" height={height}>
          {kind === 'line' ? (
            <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={x} stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  fontSize: 13,
                }}
              />
              {legend && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {ys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={x} stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  fontSize: 13,
                }}
              />
              {legend && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {ys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={PALETTE[i % PALETTE.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-ink-muted">{caption}</figcaption>
      )}
    </figure>
  );
}

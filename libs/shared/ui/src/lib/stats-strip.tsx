import { Card } from './card';
import { cn } from './utils';

export interface Stat {
  label: string;
  value: string;
}

function StatItem({ label, value }: Stat) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export interface StatsStripProps {
  stats: Stat[];
  className?: string;
}

/** Horizontal strip summarising a set of label/value stats. */
export function StatsStrip({ stats, className }: StatsStripProps) {
  return (
    <Card className={cn('flex-row items-center gap-6 rounded-xl px-5 py-3 shadow-none', className)}>
      {stats.map((stat) => (
        <StatItem key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </Card>
  );
}

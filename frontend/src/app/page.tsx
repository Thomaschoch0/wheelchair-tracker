type TimeframeKey = "today" | "week" | "year";

type DashboardTimeframe = {
  label: string;
  progressScore: number; // 0..100
  avgImbalancePct: number; // 0..100
  totalAlerts: number;
  pushes: {
    leftAvgN: number;
    rightAvgN: number;
  };
};

type Insight = {
  title: string;
  detail: string;
  tag: "Good" | "Watch" | "Action";
};

const sampleData: Record<TimeframeKey, DashboardTimeframe> = {
  today: {
    label: "Today",
    progressScore: 78,
    avgImbalancePct: 6.4,
    totalAlerts: 3,
    pushes: { leftAvgN: 142, rightAvgN: 132 },
  },
  week: {
    label: "Week",
    progressScore: 83,
    avgImbalancePct: 5.1,
    totalAlerts: 9,
    pushes: { leftAvgN: 138, rightAvgN: 135 },
  },
  year: {
    label: "Year",
    progressScore: 74,
    avgImbalancePct: 7.9,
    totalAlerts: 142,
    pushes: { leftAvgN: 145, rightAvgN: 129 },
  },
};

const sampleInsights: Insight[] = [
  {
    title: "Smoother symmetry this week",
    detail:
      "Average left/right imbalance improved by 1.3% compared to last week.",
    tag: "Good",
  },
  {
    title: "Most alerts after long pushes",
    detail:
      "Imbalance alerts cluster after 12+ minutes of continuous propulsion.",
    tag: "Watch",
  },
  {
    title: "Try a cadence reset",
    detail:
      "A 30–60 second cadence check-in every 10 minutes may reduce drift to the right.",
    tag: "Action",
  },
];

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function formatNumber(n: number) {
  return Intl.NumberFormat(undefined).format(n);
}

function scoreToLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Needs attention";
}

function scoreToColor(score: number) {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 70) return "bg-sky-500";
  if (score >= 55) return "bg-amber-500";
  return "bg-rose-500";
}

function tagStyles(tag: Insight["tag"]) {
  switch (tag) {
    case "Good":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "Watch":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "Action":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
    default:
      return "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200";
  }
}

function Tile({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-3xl bg-white/80 ring-1 ring-zinc-200/60 shadow-sm backdrop-blur",
        "p-5 sm:p-6",
        className,
      ].join(" ")}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          {title}
        </h2>
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-zinc-900">
        {value}
      </div>
      {sub ? <div className="text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function ForceBar({
  label,
  value,
  max,
  tint,
}: {
  label: string;
  value: number;
  max: number;
  tint: "left" | "right";
}) {
  const pct = clamp01(value / max);
  const barClass =
    tint === "left" ? "from-sky-500 to-cyan-400" : "from-indigo-500 to-violet-400";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-medium text-zinc-800">{label}</div>
        <div className="text-sm font-semibold text-zinc-900">
          {formatNumber(value)} <span className="text-xs text-zinc-500">N</span>
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-zinc-100 ring-1 ring-zinc-200/60 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const stroke = 10;
  const c = 2 * Math.PI * r;
  const p = clamp01(score / 100);
  const dash = c * p;

  return (
    <div className="relative grid place-items-center">
      <svg
        width={120}
        height={120}
        viewBox="0 0 120 120"
        className="block"
        aria-label={`Progress score ${score}`}
      >
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgba(228, 228, 231, 0.9)"
          strokeWidth={stroke}
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="text-3xl font-semibold tracking-tight text-zinc-900">
          {score}
        </div>
        <div className="text-xs font-medium text-zinc-500">/ 100</div>
      </div>
    </div>
  );
}

function TimeframeCard({
  active,
  label,
  progressScore,
  avgImbalancePct,
  totalAlerts,
}: {
  active: boolean;
  label: string;
  progressScore: number;
  avgImbalancePct: number;
  totalAlerts: number;
}) {
  return (
    <div
      className={[
        "rounded-3xl p-5 sm:p-6 ring-1 shadow-sm",
        active
          ? "bg-white ring-zinc-200/70"
          : "bg-white/70 ring-zinc-200/50 hover:bg-white/80",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight text-zinc-900">
            {label}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Summary</div>
        </div>
        <div
          className={[
            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
            "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200/70",
          ].join(" ")}
        >
          {scoreToLabel(progressScore)}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat label="Score" value={`${progressScore}`} sub="0–100" />
        <Stat label="Avg imbalance" value={formatPct(avgImbalancePct)} />
        <Stat label="Alerts" value={formatNumber(totalAlerts)} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-zinc-500">
            Progress score
          </div>
          <div className="text-xs font-semibold text-zinc-700">
            {progressScore}%
          </div>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-zinc-100 ring-1 ring-zinc-200/60 overflow-hidden">
          <div
            className={`h-full rounded-full ${scoreToColor(progressScore)}`}
            style={{ width: `${Math.round(clamp01(progressScore / 100) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const selected: TimeframeKey = "today";
  const tf = sampleData[selected];

  const maxForce = Math.max(tf.pushes.leftAvgN, tf.pushes.rightAvgN) * 1.15;
  const total = tf.pushes.leftAvgN + tf.pushes.rightAvgN;
  const splitLeft = total === 0 ? 0.5 : tf.pushes.leftAvgN / total;
  const splitRight = 1 - splitLeft;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-50 via-zinc-50 to-white text-zinc-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live sample data
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Wheel Watchers Dashboard
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Propulsion symmetry and force trends. Last sync:{" "}
              <span className="font-medium text-zinc-800">2 min ago</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-zinc-600 ring-1 ring-zinc-200/60">
              <div className="font-semibold text-zinc-900">Device</div>
              <div className="mt-0.5">WheelSense v2 • Indoor</div>
            </div>
            <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-zinc-600 ring-1 ring-zinc-200/60">
              <div className="font-semibold text-zinc-900">Session</div>
              <div className="mt-0.5">Propulsion tracking</div>
            </div>
          </div>
        </header>

        <main className="mt-8 space-y-6">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(["today", "week", "year"] as const).map((k) => {
              const d = sampleData[k];
              return (
                <TimeframeCard
                  key={k}
                  active={k === selected}
                  label={d.label}
                  progressScore={d.progressScore}
                  avgImbalancePct={d.avgImbalancePct}
                  totalAlerts={d.totalAlerts}
                />
              );
            })}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Tile title="Progress score" className="lg:col-span-4">
              <div className="flex items-center justify-between gap-6">
                <ScoreRing score={tf.progressScore} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-zinc-900">
                    {scoreToLabel(tf.progressScore)}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">
                    Based on symmetry, alert rate, and force stability.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200/60">
                      <div className="text-xs font-medium text-zinc-500">
                        Avg imbalance
                      </div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {formatPct(tf.avgImbalancePct)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200/60">
                      <div className="text-xs font-medium text-zinc-500">
                        Alerts
                      </div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {formatNumber(tf.totalAlerts)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Tile>

            <Tile title="Average imbalance" className="lg:col-span-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">
                    {formatPct(tf.avgImbalancePct)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Mean absolute left/right force difference.
                  </div>
                </div>
                <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200/60">
                  <div className="text-xs font-medium text-zinc-500">
                    Target range
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    ≤ 6.0%
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>0%</span>
                  <span>10%</span>
                  <span>20%</span>
                </div>
                <div className="mt-2 h-3 w-full rounded-full bg-zinc-100 ring-1 ring-zinc-200/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-rose-500"
                    style={{
                      width: `${Math.round(
                        clamp01(tf.avgImbalancePct / 20) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Lower is better; sustained spikes often correlate with fatigue.
                </div>
              </div>
            </Tile>

            <Tile title="Total imbalance alerts" className="lg:col-span-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">
                    {formatNumber(tf.totalAlerts)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Events where imbalance exceeded threshold.
                  </div>
                </div>
                <div className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200/60">
                  <div className="text-xs font-medium text-zinc-500">
                    Threshold
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    ≥ 12%
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { label: "Morning", value: Math.max(0, Math.floor(tf.totalAlerts * 0.28)) },
                  { label: "Midday", value: Math.max(0, Math.floor(tf.totalAlerts * 0.44)) },
                  { label: "Evening", value: Math.max(0, tf.totalAlerts - Math.floor(tf.totalAlerts * 0.28) - Math.floor(tf.totalAlerts * 0.44)) },
                ].map((x) => (
                  <div
                    key={x.label}
                    className="rounded-2xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-200/60"
                  >
                    <div className="text-xs font-medium text-zinc-500">
                      {x.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-zinc-900">
                      {formatNumber(x.value)}
                    </div>
                  </div>
                ))}
              </div>
            </Tile>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Tile title="Left vs right push force" className="lg:col-span-7">
              <div className="grid grid-cols-1 gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ForceBar
                    label="Left average"
                    value={tf.pushes.leftAvgN}
                    max={maxForce}
                    tint="left"
                  />
                  <ForceBar
                    label="Right average"
                    value={tf.pushes.rightAvgN}
                    max={maxForce}
                    tint="right"
                  />
                </div>

                <div className="rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900">
                      Force split
                    </div>
                    <div className="text-xs text-zinc-600">
                      Left {Math.round(splitLeft * 100)}% • Right{" "}
                      {Math.round(splitRight * 100)}%
                    </div>
                  </div>
                  <div className="mt-3 h-3 w-full rounded-full bg-white ring-1 ring-zinc-200/60 overflow-hidden">
                    <div className="flex h-full w-full">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-cyan-400"
                        style={{ width: `${Math.round(splitLeft * 100)}%` }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-400"
                        style={{ width: `${Math.round(splitRight * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Tip: persistent splits ≥ 55/45 may increase shoulder load over time.
                  </div>
                </div>
              </div>
            </Tile>

            <Tile title="Insights" className="lg:col-span-5">
              <div className="space-y-3">
                {sampleInsights.map((insight) => (
                  <div
                    key={insight.title}
                    className="rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-900">
                        {insight.title}
                      </div>
                      <div
                        className={[
                          "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
                          tagStyles(insight.tag),
                        ].join(" ")}
                      >
                        {insight.tag}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {insight.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-3xl bg-white/70 p-4 ring-1 ring-zinc-200/60">
                <div className="text-xs font-medium text-zinc-500">
                  Coming next
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  Trend charts & alert drill-down
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Hook this up to your sensor stream when ready.
                </div>
              </div>
            </Tile>
          </section>
        </main>

        <footer className="mt-10 flex flex-col gap-2 border-t border-zinc-200/60 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            Displaying:{" "}
            <span className="font-medium text-zinc-700">{tf.label}</span> • Fake
            sample data
          </div>
          <div>Wheel Watchers • Health-tech dashboard prototype</div>
        </footer>
      </div>
    </div>
  );
}

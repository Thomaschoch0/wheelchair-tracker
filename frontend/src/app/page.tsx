"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type AuthMode = "login" | "signup" | "reset";
type AppView = "dashboard" | "progress" | "insights" | "customize" | "training";
type TrendRange = "day" | "week" | "month" | "year" | "all";
type TrainingReading = {
  id: string;
  timestamp: number;
  leftForceRaw: number;
  rightForceRaw: number;
  totalForceRaw: number;
};
type TrainingPause = {
  start: number;
  end: number | null;
};

const trendRanges: Array<{ key: TrendRange; label: string }> = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
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

function formatDecimal(n: number, digits = 1) {
  return n.toFixed(digits);
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function scoreToLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Needs attention";
}

function buildInsightFeedback(summary: {
  progressScore: number;
  avgImbalancePct: number;
  totalAlerts: number;
  pushes: { leftAvgN: number; rightAvgN: number };
}) {
  const forceTotal =
    Math.abs(summary.pushes.leftAvgN) + Math.abs(summary.pushes.rightAvgN);
  const forceDifferencePct =
    forceTotal === 0
      ? 0
      : (Math.abs(summary.pushes.leftAvgN - summary.pushes.rightAvgN) /
          forceTotal) *
        100;
  const strongerSide =
    summary.pushes.leftAvgN > summary.pushes.rightAvgN ? "left" : "right";
  const feedback = [];

  if (summary.progressScore >= 85) {
    feedback.push({
      title: "Strong propulsion pattern",
      tone: "emerald",
      body: "Your overall score is in a strong range. Keep the same rhythm and watch for fatigue late in longer sessions.",
    });
  } else if (summary.progressScore >= 70) {
    feedback.push({
      title: "Good baseline",
      tone: "blue",
      body: "Your pushes are generally consistent. The biggest improvement will come from smoothing out uneven force spikes.",
    });
  } else {
    feedback.push({
      title: "Needs steadier pushes",
      tone: "rose",
      body: "Your recent readings show enough imbalance to affect efficiency. Try shorter, smoother pushes with both hands starting together.",
    });
  }

  if (summary.avgImbalancePct >= 12) {
    feedback.push({
      title: "Balance the left and right push",
      tone: "amber",
      body: `Average imbalance is ${formatPct(summary.avgImbalancePct)}. Focus on matching hand timing before increasing force.`,
    });
  } else {
    feedback.push({
      title: "Symmetry looks controlled",
      tone: "emerald",
      body: `Average imbalance is ${formatPct(summary.avgImbalancePct)}, which suggests your force is staying fairly even.`,
    });
  }

  if (forceDifferencePct >= 10) {
    feedback.push({
      title: `${strongerSide[0].toUpperCase()}${strongerSide.slice(1)} side is working harder`,
      tone: "amber",
      body: `Your average push force differs by ${formatPct(forceDifferencePct)}. Reduce effort on the ${strongerSide} side or cue the other hand earlier.`,
    });
  } else {
    feedback.push({
      title: "Push force is well matched",
      tone: "blue",
      body: "Left and right force averages are close. Keep this consistency during starts, stops, and turns.",
    });
  }

  if (summary.totalAlerts > 0) {
    feedback.push({
      title: "Review high-imbalance moments",
      tone: "rose",
      body: `${formatNumber(summary.totalAlerts)} recent readings crossed the imbalance threshold. These are useful moments to compare against turns, ramps, or fatigue.`,
    });
  }

  return feedback;
}

function makeSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function hashPassword(email: string, password: string) {
  const data = new TextEncoder().encode(
    `${email.trim().toLowerCase()}:${password}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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

function TrendChart({
  points,
}: {
  points: Array<{ label: string; score: number; timestamp: number }>;
}) {
  const width = 900;
  const height = 360;
  const padX = 28;
  const padY = 30;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;
  const visiblePoints =
    points.length > 1
      ? points
      : points.length === 1
        ? [
            { ...points[0], timestamp: points[0].timestamp - 1 },
            points[0],
          ]
        : [];
  const coords = visiblePoints.map((point, index) => {
    const x =
      padX +
      (visiblePoints.length === 1
        ? chartWidth
        : (index / Math.max(1, visiblePoints.length - 1)) * chartWidth);
    const y = padY + (1 - clamp01(point.score / 100)) * chartHeight;

    return { ...point, x, y };
  });
  const areaPath =
    coords.length > 0
      ? [
          `M ${coords[0].x} ${height - padY}`,
          ...coords.map((point) => `L ${point.x} ${point.y}`),
          `L ${coords[coords.length - 1].x} ${height - padY}`,
          "Z",
        ].join(" ")
      : "";

  if (coords.length === 0) {
    return (
      <div className="grid aspect-[16/7] min-h-72 place-items-center rounded-lg bg-zinc-50 text-sm text-zinc-500 ring-1 ring-zinc-200/70">
        No progress readings yet
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-zinc-950 p-4 text-white shadow-sm">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block aspect-[16/7] w-full"
        role="img"
        aria-label="Progress score trend graph"
      >
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,197,94,0.28)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0.02)" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((line) => {
          const y = padY + (1 - line / 100) * chartHeight;

          return (
            <g key={line}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.09)"
              />
              <text
                x={padX}
                y={y - 8}
                fill="rgba(255,255,255,0.45)"
                fontSize="12"
              >
                {line}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#trendArea)" />
        {coords.slice(1).map((point, index) => {
          const previous = coords[index];
          const isGood = point.score >= previous.score || point.score >= 70;

          return (
            <line
              key={`${point.timestamp}-${index}`}
              x1={previous.x}
              y1={previous.y}
              x2={point.x}
              y2={point.y}
              stroke={isGood ? "#22c55e" : "#ef4444"}
              strokeWidth="5"
              strokeLinecap="round"
            />
          );
        })}
        {coords.map((point, index) => (
          <circle
            key={`${point.timestamp}-${index}`}
            cx={point.x}
            cy={point.y}
            r="5"
            fill={point.score >= 70 ? "#22c55e" : "#ef4444"}
            stroke="#18181b"
            strokeWidth="3"
          />
        ))}
        {coords
          .filter((_, index) => {
            if (coords.length <= 6) return true;
            return index === 0 || index === coords.length - 1 || index % 3 === 0;
          })
          .map((point, index) => (
            <text
              key={`${point.timestamp}-label-${index}`}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              fill="rgba(255,255,255,0.52)"
              fontSize="12"
            >
              {point.label}
            </text>
          ))}
      </svg>
    </div>
  );
}

function SessionLineChart({
  title,
  points,
  color,
  valueLabel,
}: {
  title: string;
  points: Array<{ timestamp: number; value: number }>;
  color: string;
  valueLabel: string;
}) {
  const width = 760;
  const height = 220;
  const padX = 28;
  const padY = 24;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const minTime = points[0]?.timestamp ?? 0;
  const maxTime = points[points.length - 1]?.timestamp ?? minTime + 1;
  const timeSpan = Math.max(1, maxTime - minTime);
  const coords = points.map((point) => ({
    x: padX + ((point.timestamp - minTime) / timeSpan) * chartWidth,
    y: padY + (1 - point.value / maxValue) * chartHeight,
    value: point.value,
  }));
  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <section className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
        <div className="text-xs font-medium text-zinc-500">{valueLabel}</div>
      </div>
      {coords.length < 2 ? (
        <div className="mt-4 grid aspect-[16/6] min-h-40 place-items-center rounded-2xl bg-zinc-50 text-sm text-zinc-500 ring-1 ring-zinc-100">
          Start a session to collect graph data
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-4 block aspect-[16/6] w-full"
          role="img"
          aria-label={`${title} graph`}
        >
          {[0.25, 0.5, 0.75].map((line) => {
            const y = padY + line * chartHeight;

            return (
              <line
                key={line}
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth="1"
              />
            );
          })}
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
          {coords.map((point, index) =>
            index % Math.max(1, Math.floor(coords.length / 8)) === 0 ? (
              <circle
                key={`${point.x}-${index}`}
                cx={point.x}
                cy={point.y}
                r="4"
                fill={color}
                stroke="white"
                strokeWidth="2"
              />
            ) : null,
          )}
        </svg>
      )}
    </section>
  );
}

function TrainingMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function deriveTrainingMetrics(readings: TrainingReading[]) {
  const complete = readings.filter((reading) => reading.totalForceRaw > 0);
  const forcePoints = readings.map((reading) => ({
    timestamp: reading.timestamp,
    value: reading.totalForceRaw,
  }));
  const balancePoints = readings.map((reading) => {
    const total = Math.abs(reading.leftForceRaw) + Math.abs(reading.rightForceRaw);
    const imbalance = total === 0 ? 0 : (Math.abs(reading.leftForceRaw - reading.rightForceRaw) / total) * 100;

    return {
      timestamp: reading.timestamp,
      value: imbalance,
    };
  });
  const forceChanges = readings.slice(1).map((reading, index) => {
    const previous = readings[index];
    const seconds = Math.max(0.25, (reading.timestamp - previous.timestamp) / 1000);

    return {
      timestamp: reading.timestamp,
      value: (reading.totalForceRaw - previous.totalForceRaw) / seconds,
    };
  });
  const accelerationPoints = forceChanges.map((point) => ({
    timestamp: point.timestamp,
    value: Math.max(0, point.value),
  }));
  const decelerationPoints = forceChanges.map((point) => ({
    timestamp: point.timestamp,
    value: Math.max(0, -point.value),
  }));
  const totalForces = complete.map((reading) => reading.totalForceRaw);
  const averageForce = Math.round(averageClient(totalForces));
  const peakForce = Math.round(Math.max(0, ...totalForces));
  const pushThreshold = Math.max(18, peakForce * 0.28);
  const pushes = complete.reduce((count, reading, index) => {
    const previous = complete[index - 1]?.totalForceRaw ?? 0;

    return previous < pushThreshold && reading.totalForceRaw >= pushThreshold
      ? count + 1
      : count;
  }, 0);
  const startForce = Math.round(
    averageClient(complete.slice(0, Math.max(1, Math.ceil(complete.length * 0.2))).map((reading) => reading.totalForceRaw)),
  );
  const stopForce = Math.round(
    averageClient(complete.slice(-Math.max(1, Math.ceil(complete.length * 0.2))).map((reading) => reading.totalForceRaw)),
  );
  const peakStartRate = Math.round(Math.max(0, ...accelerationPoints.map((point) => point.value)));
  const peakStopRate = Math.round(Math.max(0, ...decelerationPoints.map((point) => point.value)));
  const maxTurnImbalance = Math.round(Math.max(0, ...balancePoints.map((point) => point.value)));
  const turnExitScore = Math.max(0, Math.min(100, Math.round(100 - maxTurnImbalance * 1.7)));

  return {
    forcePoints,
    balancePoints,
    accelerationPoints,
    decelerationPoints,
    averageForce,
    peakForce,
    pushes,
    startForce,
    stopForce,
    peakStartRate,
    peakStopRate,
    maxTurnImbalance,
    turnExitScore,
  };
}

function averageClient(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function TrainingSessionScreen({
  wheelchairName,
  readings,
  startedAt,
  stoppedAt,
  pausedAt,
  pauses,
  onStart,
  onPause,
  onResume,
  onStop,
  onBack,
}: {
  wheelchairName: string;
  readings: TrainingReading[];
  startedAt: number | null;
  stoppedAt: number | null;
  pausedAt: number | null;
  pauses: TrainingPause[];
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onBack: () => void;
}) {
  const [now, setNow] = useState(0);
  const isActive =
    startedAt !== null && stoppedAt === null && pausedAt === null;
  const isPaused =
    startedAt !== null && stoppedAt === null && pausedAt !== null;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const id = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(id);
  }, [isActive]);

  const windowEnd = stoppedAt ?? pausedAt ?? Math.max(now, startedAt ?? 0);
  const pausedMs = pauses.reduce((total, pause) => {
    const pauseEnd = pause.end ?? windowEnd;

    return total + Math.max(0, pauseEnd - pause.start);
  }, 0);
  const sessionReadings =
    startedAt === null
      ? readings.slice(-80)
      : readings.filter(
          (reading) => {
            const isInSession =
              reading.timestamp >= startedAt && reading.timestamp <= windowEnd;
            const isDuringPause = pauses.some((pause) => {
              const pauseEnd = pause.end ?? windowEnd;

              return reading.timestamp >= pause.start && reading.timestamp <= pauseEnd;
            });

            return isInSession && !isDuringPause;
          },
        );
  const metrics = deriveTrainingMetrics(sessionReadings);
  const elapsedMs =
    startedAt === null ? 0 : Math.max(0, windowEnd - startedAt - pausedMs);

  return (
    <div className="health-backdrop-soft min-h-dvh text-zinc-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-blue-100 backdrop-blur transition hover:bg-white"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStart}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              {startedAt === null || stoppedAt !== null ? "Start" : "Restart"}
            </button>
            {isPaused ? (
              <button
                type="button"
                onClick={onResume}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                disabled={!isActive}
                className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm ring-1 ring-blue-100 backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={onStop}
              disabled={startedAt === null || stoppedAt !== null}
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              Stop
            </button>
          </div>
        </div>

        <header className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-rose-600">
              {wheelchairName}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Training session
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Force is measured from the wheel sensors. Start, stop, deceleration, and turn exit are estimated from force changes until acceleration sensors are added.
            </p>
          </div>
          <div className="rounded-3xl bg-white/90 px-5 py-4 shadow-sm ring-1 ring-blue-100 backdrop-blur">
            <div className="text-xs font-medium text-zinc-500">
              {isPaused
                ? "Paused"
                : isActive
                  ? "Recording"
                  : stoppedAt
                    ? "Stopped"
                    : "Ready"}
            </div>
            <div className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              {formatDuration(elapsedMs)}
            </div>
          </div>
        </header>

        <main className="mt-8 space-y-5">
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <TrainingMetric
              label="Pushes"
              value={formatNumber(metrics.pushes)}
              sub="Detected force peaks"
            />
            <TrainingMetric
              label="Average force"
              value={`${formatNumber(metrics.averageForce)} N`}
              sub={`Peak ${formatNumber(metrics.peakForce)} N`}
            />
            <TrainingMetric
              label="Start speed"
              value={`${formatNumber(metrics.peakStartRate)} N/s`}
              sub={`Start force ${formatNumber(metrics.startForce)} N`}
            />
            <TrainingMetric
              label="Stop speed"
              value={`${formatNumber(metrics.peakStopRate)} N/s`}
              sub={`Stop force ${formatNumber(metrics.stopForce)} N`}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SessionLineChart
              title="Force while pushing"
              points={metrics.forcePoints}
              color="#2563eb"
              valueLabel={`${formatNumber(metrics.averageForce)} N avg`}
            />
            <SessionLineChart
              title="Start acceleration estimate"
              points={metrics.accelerationPoints}
              color="#059669"
              valueLabel={`${formatNumber(metrics.peakStartRate)} N/s peak`}
            />
            <SessionLineChart
              title="Stopping and deceleration estimate"
              points={metrics.decelerationPoints}
              color="#dc2626"
              valueLabel={`${formatNumber(metrics.peakStopRate)} N/s peak`}
            />
            <SessionLineChart
              title="Turning balance"
              points={metrics.balancePoints}
              color="#7c3aed"
              valueLabel={`${formatNumber(metrics.maxTurnImbalance)}% max`}
            />
          </section>

          <section className="rounded-3xl bg-white/90 p-6 shadow-sm ring-1 ring-blue-100 backdrop-blur">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Session summary
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat
                label="Force pushed"
                value={`${formatNumber(metrics.averageForce)} N`}
                sub={`${formatNumber(metrics.pushes)} pushes recorded`}
              />
              <Stat
                label="Start and stop"
                value={`${formatDecimal(metrics.peakStartRate / Math.max(1, metrics.peakStopRate), 2)}x`}
                sub="Start rate compared with stop rate"
              />
              <Stat
                label="Turn exit"
                value={`${metrics.turnExitScore}`}
                sub={`${formatNumber(metrics.maxTurnImbalance)}% max side difference`}
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function ProgressDetailScreen({
  wheelchairName,
  summary,
  points,
  selectedRange,
  onRangeChange,
  onBack,
}: {
  wheelchairName: string;
  summary: {
    progressScore: number;
    avgImbalancePct: number;
    totalAlerts: number;
  };
  points: Array<{ label: string; score: number; timestamp: number }>;
  selectedRange: TrendRange;
  onRangeChange: (range: TrendRange) => void;
  onBack: () => void;
}) {
  const firstScore = points[0]?.score ?? summary.progressScore;
  const latestScore = points[points.length - 1]?.score ?? summary.progressScore;
  const scoreChange = latestScore - firstScore;

  return (
    <div className="health-backdrop-soft min-h-dvh text-zinc-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-blue-100 backdrop-blur transition hover:bg-white"
        >
          Back
        </button>

        <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              {wheelchairName}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Progress score
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Score movement over time, with green for stronger days and red for
              weaker days.
            </p>
          </div>
          <div className="rounded-3xl bg-white/90 px-5 py-4 shadow-sm ring-1 ring-blue-100 backdrop-blur">
            <div className="text-xs font-medium text-zinc-500">Current</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              {summary.progressScore}
            </div>
            <div
              className={[
                "mt-1 text-sm font-semibold",
                scoreChange >= 0 ? "text-emerald-600" : "text-rose-600",
              ].join(" ")}
            >
              {scoreChange >= 0 ? "+" : ""}
              {scoreChange} this range
            </div>
          </div>
        </header>

        <main className="mt-8 space-y-5">
          <div className="flex flex-wrap gap-2">
            {trendRanges.map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => onRangeChange(range.key)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  selectedRange === range.key
                    ? "bg-blue-600 text-white"
                    : "bg-white/90 text-zinc-700 ring-1 ring-blue-100 hover:bg-white",
                ].join(" ")}
              >
                {range.label}
              </button>
            ))}
          </div>

          <TrendChart points={points} />

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <Stat
                label="Current score"
                value={`${summary.progressScore}`}
                sub={scoreToLabel(summary.progressScore)}
              />
            </div>
            <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <Stat
                label="Average imbalance"
                value={formatPct(summary.avgImbalancePct)}
                sub="Lower is better"
              />
            </div>
            <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <Stat
                label="Alerts"
                value={formatNumber(summary.totalAlerts)}
                sub="Higher imbalance readings"
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function InsightsScreen({
  wheelchairName,
  summary,
  alerts,
  onBack,
}: {
  wheelchairName: string;
  summary: {
    progressScore: number;
    avgImbalancePct: number;
    totalAlerts: number;
    pushes: { leftAvgN: number; rightAvgN: number };
  };
  alerts: Array<{
    id: string;
    timestamp: number;
    label: string;
    imbalancePct: number;
    leftForceRaw?: number;
    rightForceRaw?: number;
  }>;
  onBack: () => void;
}) {
  const feedback = buildInsightFeedback(summary);

  return (
    <div className="health-backdrop-soft min-h-dvh text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-blue-100 backdrop-blur transition hover:bg-white"
        >
          Back
        </button>

        <header className="mt-8">
          <div className="text-sm font-semibold text-amber-600">
            {wheelchairName}
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
            Insights
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Feedback from your recent push force, symmetry, and high-imbalance moments.
          </p>
        </header>

        <main className="mt-8 space-y-5">
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <Stat
                label="Current score"
                value={`${summary.progressScore}`}
                sub={scoreToLabel(summary.progressScore)}
              />
            </div>
            <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <Stat
                label="Symmetry"
                value={formatPct(summary.avgImbalancePct)}
                sub="Lower imbalance is better"
              />
            </div>
            <div className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <Stat
                label="Force"
                value={`${formatNumber(summary.pushes.leftAvgN)} / ${formatNumber(summary.pushes.rightAvgN)}`}
                sub="Left / right average"
              />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            {feedback.map((item) => (
              <article
                key={item.title}
                className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur"
              >
                <div
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1",
                    item.tone === "emerald"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                      : item.tone === "rose"
                        ? "bg-rose-50 text-rose-700 ring-rose-100"
                        : item.tone === "amber"
                          ? "bg-amber-50 text-amber-700 ring-amber-100"
                          : "bg-blue-50 text-blue-700 ring-blue-100",
                  ].join(" ")}
                >
                  Feedback
                </div>
                <h2 className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {item.body}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-blue-100 backdrop-blur">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  High-imbalance moments
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Recent readings that shaped the feedback above.
                </p>
              </div>
              <div className="text-sm font-semibold text-amber-600">
                {formatNumber(alerts.length)} shown
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
                No high-imbalance readings in the recent data.
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-zinc-100">
                {alerts.slice(0, 8).map((alert) => (
                <div
                  key={alert.id}
                  className="flex flex-col gap-3 border-b border-zinc-100 p-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-zinc-950">
                      {alert.label}
                    </div>
                    <div className="mt-1 text-sm text-zinc-500">
                      Left {formatNumber(alert.leftForceRaw ?? 0)} N - Right{" "}
                      {formatNumber(alert.rightForceRaw ?? 0)} N
                    </div>
                  </div>
                  <div className="inline-flex w-fit items-center rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">
                    {formatPct(alert.imbalancePct)}
                  </div>
                </div>
              ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function CustomizeWheelchairScreen({
  currentName,
  deviceId,
  error,
  isSaving,
  onSave,
  onBack,
}: {
  currentName: string;
  deviceId: string;
  error: string;
  isSaving: boolean;
  onSave: (name: string) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState(currentName);

  return (
    <div className="health-backdrop-soft min-h-dvh text-zinc-900">
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-blue-100 backdrop-blur transition hover:bg-white"
        >
          Back
        </button>

        <section className="mt-8 rounded-3xl bg-white/90 p-6 shadow-sm ring-1 ring-blue-100 backdrop-blur sm:p-8">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-blue-600 text-4xl font-semibold text-white">
            {name.trim().slice(0, 1).toUpperCase() || "W"}
          </div>
          <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight text-zinc-950">
            Customize wheelchair
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-500">
            Device {deviceId}
          </p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSave(name);
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                placeholder="My wheelchair"
                required
              />
            </label>

            {error ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (sessionToken: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signUp = useMutation(api.users.signUp);
  const logIn = useMutation(api.users.logIn);
  const resetPassword = useMutation(api.users.resetPassword);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const passwordHash = await hashPassword(trimmedEmail, password);
      const sessionToken = makeSessionToken();

      if (mode === "signup") {
        if (!name.trim()) {
          throw new Error("Please enter your name.");
        }

        await signUp({
          name,
          email: trimmedEmail,
          passwordHash,
          sessionToken,
        });
      } else if (mode === "reset") {
        await resetPassword({
          email: trimmedEmail,
          passwordHash,
          sessionToken,
        });
      } else {
        await logIn({
          email: trimmedEmail,
          passwordHash,
          sessionToken,
        });
      }

      localStorage.setItem("wheel-watchers-session", sessionToken);
      onAuthenticated(sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="health-backdrop grid min-h-dvh place-items-center px-4 py-10 text-zinc-900">
      <section className="w-full max-w-md rounded-3xl bg-white/90 p-6 shadow-sm ring-1 ring-blue-100 backdrop-blur sm:p-8">
        <div>
          <div className="text-sm font-semibold text-blue-600">
            Wheel Watchers
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
            {mode === "signup"
              ? "Create your account"
              : mode === "reset"
                ? "Reset your password"
                : "Log in to continue"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {mode === "signup"
              ? "Sign up to create your private wheelchair dashboard."
              : mode === "reset"
                ? "Enter your email and choose a new password."
                : "Enter your email and password to open your wheelchair data."}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-blue-50 p-1">
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode("login");
            }}
            className={[
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              mode === "login"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-600 hover:text-zinc-950",
            ].join(" ")}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode("signup");
            }}
            className={[
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              mode === "signup"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-600 hover:text-zinc-950",
            ].join(" ")}
          >
            Sign up
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder="Your name"
                required
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Password</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-11 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder="Create a secure password"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-500 transition hover:text-zinc-900"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.9 10.9 0 0 1 12 20c-5 0-9.27-3.11-11-8a11.6 11.6 0 0 1 3.17-4.68" />
                    <path d="M9.9 4.24A10.7 10.7 0 0 1 12 4c5 0 9.27 3.11 11 8a11.8 11.8 0 0 1-2.19 3.45" />
                    <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                    <path d="M3 3l18 18" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {mode === "login" ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMode("reset");
                }}
                className="mt-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
              >
                Forgot password?
              </button>
            ) : null}
          </label>

          {error ? (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Reset password"
                : "Enter"}
          </button>

          {mode === "reset" ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode("login");
              }}
              className="w-full text-sm font-semibold text-zinc-500 transition hover:text-zinc-900"
            >
              Back to login
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}

export default function Home() {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return localStorage.getItem("wheel-watchers-session");
  });
  const [selectedWheelchairId, setSelectedWheelchairId] = useState<
    string | null
  >(null);
  const [view, setView] = useState<AppView>("dashboard");
  const [trendRange, setTrendRange] = useState<TrendRange>("week");
  const [trainingStartedAt, setTrainingStartedAt] = useState<number | null>(
    null,
  );
  const [trainingStoppedAt, setTrainingStoppedAt] = useState<number | null>(
    null,
  );
  const [trainingPausedAt, setTrainingPausedAt] = useState<number | null>(null);
  const [trainingPauses, setTrainingPauses] = useState<TrainingPause[]>([]);
  const [isWheelchairMenuOpen, setIsWheelchairMenuOpen] = useState(false);
  const [wheelchairError, setWheelchairError] = useState("");
  const [isSavingWheelchair, setIsSavingWheelchair] = useState(false);
  const dashboard = useQuery(
    api.dashboard.getDashboard,
    sessionToken ? { sessionToken } : "skip",
  );
  const logOut = useMutation(api.users.logOut);
  const updateWheelchair = useMutation(api.dashboard.updateWheelchair);

  const selectedWheelchair = useMemo(() => {
    const selected = dashboard?.wheelchairs.find(
      (wheelchair) => wheelchair.id === selectedWheelchairId,
    );

    return selected ?? dashboard?.wheelchairs[0];
  }, [dashboard, selectedWheelchairId]);

  async function handleLogOut() {
    if (sessionToken) {
      await logOut({ sessionToken });
    }

    localStorage.removeItem("wheel-watchers-session");
    setSessionToken(null);
    setSelectedWheelchairId(null);
    setView("dashboard");
  }

  async function handleWheelchairSave(name: string) {
    if (!sessionToken || !selectedWheelchair) {
      return;
    }

    setWheelchairError("");
    setIsSavingWheelchair(true);

    try {
      await updateWheelchair({
        sessionToken,
        wheelchairId: selectedWheelchair.id,
        name,
      });
      setView("dashboard");
    } catch (err) {
      setWheelchairError(
        err instanceof Error ? err.message : "Could not save wheelchair.",
      );
    } finally {
      setIsSavingWheelchair(false);
    }
  }

  function handleStartTraining() {
    setTrainingStartedAt(Date.now());
    setTrainingStoppedAt(null);
    setTrainingPausedAt(null);
    setTrainingPauses([]);
    setView("training");
  }

  function handlePauseTraining() {
    if (trainingStartedAt === null || trainingStoppedAt !== null) {
      return;
    }

    const pauseStart = Date.now();
    setTrainingPausedAt(pauseStart);
    setTrainingPauses((current) => [
      ...current,
      { start: pauseStart, end: null },
    ]);
  }

  function handleResumeTraining() {
    if (trainingPausedAt === null) {
      return;
    }

    const pauseEnd = Date.now();
    setTrainingPausedAt(null);
    setTrainingPauses((current) =>
      current.map((pause, index) =>
        index === current.length - 1 && pause.end === null
          ? { ...pause, end: pauseEnd }
          : pause,
      ),
    );
  }

  function handleStopTraining() {
    if (trainingStartedAt !== null) {
      const stoppedAt = Date.now();
      setTrainingStoppedAt(stoppedAt);
      setTrainingPausedAt(null);
      setTrainingPauses((current) =>
        current.map((pause) =>
          pause.end === null ? { ...pause, end: stoppedAt } : pause,
        ),
      );
    }
  }

  if (!sessionToken) {
    return <AuthScreen onAuthenticated={setSessionToken} />;
  }

  if (dashboard === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center bg-zinc-50 text-sm font-medium text-zinc-600">
        Loading your dashboard...
      </main>
    );
  }

  if (dashboard === null) {
    return (
      <main className="grid min-h-dvh place-items-center bg-zinc-50 px-4 text-zinc-900">
        <section className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-xl font-semibold tracking-tight">
            Please log in again
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Your saved session is no longer valid.
          </p>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("wheel-watchers-session");
              setSessionToken(null);
            }}
            className="mt-5 rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Back to login
          </button>
        </section>
      </main>
    );
  }

  const summary = selectedWheelchair?.summary ?? {
    progressScore: 0,
    avgImbalancePct: 0,
    totalAlerts: 0,
    pushes: { leftAvgN: 0, rightAvgN: 0 },
    latestTimestamp: null,
  };
  const trendPoints = selectedWheelchair?.trends?.[trendRange] ?? [];
  const alerts = selectedWheelchair?.alerts ?? [];
  const trainingReadings = selectedWheelchair?.trainingReadings ?? [];

  if (view === "progress") {
    return (
      <ProgressDetailScreen
        wheelchairName={selectedWheelchair?.name ?? "Wheelchair"}
        summary={summary}
        points={trendPoints}
        selectedRange={trendRange}
        onRangeChange={setTrendRange}
        onBack={() => setView("dashboard")}
      />
    );
  }

  if (view === "insights") {
    return (
      <InsightsScreen
        wheelchairName={selectedWheelchair?.name ?? "Wheelchair"}
        summary={summary}
        alerts={alerts}
        onBack={() => setView("dashboard")}
      />
    );
  }

  if (view === "training") {
    return (
      <TrainingSessionScreen
        wheelchairName={selectedWheelchair?.name ?? "Wheelchair"}
        readings={trainingReadings}
        startedAt={trainingStartedAt}
        stoppedAt={trainingStoppedAt}
        pausedAt={trainingPausedAt}
        pauses={trainingPauses}
        onStart={handleStartTraining}
        onPause={handlePauseTraining}
        onResume={handleResumeTraining}
        onStop={handleStopTraining}
        onBack={() => setView("dashboard")}
      />
    );
  }

  if (view === "customize") {
    return (
      <CustomizeWheelchairScreen
        currentName={selectedWheelchair?.name ?? "My wheelchair"}
        deviceId={selectedWheelchair?.deviceId ?? "wheelchair_001"}
        error={wheelchairError}
        isSaving={isSavingWheelchair}
        onSave={handleWheelchairSave}
        onBack={() => setView("dashboard")}
      />
    );
  }

  return (
    <div className="health-backdrop min-h-dvh text-zinc-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-8 sm:px-6">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              Wheel Watchers
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              {selectedWheelchair?.name ?? "My wheelchair"}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {summary.latestTimestamp
                ? `Last sync ${new Date(summary.latestTimestamp).toLocaleString()}`
                : "Waiting for sensor data"}
            </p>
          </div>

          <div className="relative flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsWheelchairMenuOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm outline-none backdrop-blur transition hover:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              aria-expanded={isWheelchairMenuOpen}
              aria-haspopup="menu"
            >
              {selectedWheelchair?.name ?? "My wheelchair"}
              <svg
                aria-hidden="true"
                className={[
                  "h-4 w-4 text-zinc-500 transition",
                  isWheelchairMenuOpen ? "rotate-180" : "",
                ].join(" ")}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isWheelchairMenuOpen ? (
              <div
                className="absolute right-20 top-12 z-10 w-72 overflow-hidden rounded-3xl bg-white/95 p-2 shadow-xl ring-1 ring-blue-100 backdrop-blur"
                role="menu"
              >
                {dashboard.wheelchairs.map((wheelchair) => (
                  <div
                    key={wheelchair.id}
                    className="group flex items-center justify-between gap-3 rounded-2xl px-3 py-2 transition hover:bg-zinc-50"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWheelchairId(wheelchair.id);
                        setIsWheelchairMenuOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                      role="menuitem"
                    >
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {wheelchair.name}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {wheelchair.deviceId}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWheelchairId(wheelchair.id);
                        setWheelchairError("");
                        setIsWheelchairMenuOpen(false);
                        setView("customize");
                      }}
                      className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white opacity-0 transition hover:bg-blue-700 group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      Rename
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleLogOut}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Log out
            </button>
          </div>
        </header>

        <main className="mx-auto mt-10 grid w-full max-w-[620px] grid-cols-2 gap-x-6 gap-y-10 pb-10 sm:gap-x-12 sm:gap-y-12">
          <button
            type="button"
            onClick={() => setView("progress")}
            className="streaks-press flex flex-col items-center gap-4 text-center focus:outline-none"
          >
            <div className="streaks-tile grid aspect-square w-full max-w-[250px] place-items-center rounded-full bg-white/95 ring-8 ring-white/70 backdrop-blur">
              <div className="grid place-items-center">
                <div className="text-6xl font-semibold tracking-tight text-blue-600 sm:text-7xl">
                  {summary.progressScore}
                </div>
                <div className="mt-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
                  Score
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-500">
                  {formatPct(summary.avgImbalancePct)} symmetry
                </div>
              </div>
            </div>
            <div>
              <div className="text-base font-black uppercase tracking-tight text-zinc-950 sm:text-lg">
                Health
              </div>
              <div className="mt-1 text-sm font-semibold text-blue-600">
                {scoreToLabel(summary.progressScore)}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setView("insights")}
            className="streaks-press flex flex-col items-center gap-4 text-center focus:outline-none"
          >
            <div className="streaks-tile grid aspect-square w-full max-w-[250px] place-items-center rounded-full bg-white/95 ring-8 ring-white/70 backdrop-blur">
              <div className="grid place-items-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-amber-50 text-amber-500">
                  <svg
                    aria-hidden="true"
                    className="h-11 w-11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M12 2a7 7 0 0 0-4 12.74V16h8v-1.26A7 7 0 0 0 12 2z" />
                  </svg>
                </div>
                <div className="mt-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
                  Tips
                </div>
              </div>
            </div>
            <div>
              <div className="text-base font-black uppercase tracking-tight text-zinc-950 sm:text-lg">
                Insights
              </div>
              <div className="mt-1 text-sm font-semibold text-amber-600">
                Get feedback
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleStartTraining}
            className="streaks-press flex flex-col items-center gap-4 text-center focus:outline-none"
          >
            <div className="streaks-tile grid aspect-square w-full max-w-[250px] place-items-center rounded-full bg-white/95 ring-8 ring-white/70 backdrop-blur">
              <div className="grid place-items-center gap-3">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-rose-50 text-rose-600">
                  <svg
                    aria-hidden="true"
                    className="h-11 w-11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <div className="text-sm font-bold uppercase tracking-wide text-zinc-500">
                  Start
                </div>
              </div>
            </div>
            <div>
              <div className="text-base font-black uppercase tracking-tight text-zinc-950 sm:text-lg">
                Training
              </div>
              <div className="mt-1 text-sm font-semibold text-rose-600">
                New session
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setView("progress")}
            className="streaks-press flex flex-col items-center gap-4 text-center focus:outline-none"
          >
            <div className="streaks-tile grid aspect-square w-full max-w-[250px] place-items-center rounded-full bg-white/95 ring-8 ring-white/70 backdrop-blur">
              <div className="grid w-full place-items-center px-8">
                <div className="mb-4 flex w-full items-end justify-center gap-3">
                  <div className="h-16 w-8 rounded-full bg-blue-500" />
                  <div className="h-12 w-8 rounded-full bg-indigo-500" />
                </div>
                <div className="text-sm font-bold uppercase tracking-wide text-zinc-500">
                  Force
                </div>
              </div>
            </div>
            <div>
              <div className="text-base font-black uppercase tracking-tight text-zinc-950 sm:text-lg">
                Push Force
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-500">
                L {formatNumber(summary.pushes.leftAvgN)} / R{" "}
                {formatNumber(summary.pushes.rightAvgN)}
              </div>
            </div>
          </button>
        </main>
      </div>
    </div>
  );
}

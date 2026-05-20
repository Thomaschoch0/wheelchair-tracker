"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type AuthMode = "login" | "signup" | "reset";
type AppView = "dashboard" | "progress" | "alerts" | "customize";
type TrendRange = "day" | "week" | "month" | "year" | "all";

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

function scoreToLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Needs attention";
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

function AlertsScreen({
  wheelchairName,
  alerts,
  onBack,
}: {
  wheelchairName: string;
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
  return (
    <div className="health-backdrop-soft min-h-dvh text-zinc-900">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-blue-100 backdrop-blur transition hover:bg-white"
        >
          Back
        </button>

        <header className="mt-8">
          <div className="text-sm font-semibold text-rose-600">
            {wheelchairName}
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
            Alerts
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Times when left and right push force moved outside the healthy range.
          </p>
        </header>

        <main className="mt-8">
          {alerts.length === 0 ? (
            <section className="rounded-3xl bg-white/90 p-8 text-center shadow-sm ring-1 ring-blue-100 backdrop-blur">
              <div className="text-2xl font-semibold tracking-tight">
                No alerts yet
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Alert events will appear here once sensor readings cross the
                threshold.
              </p>
            </section>
          ) : (
            <div className="overflow-hidden rounded-3xl bg-white/90 shadow-sm ring-1 ring-blue-100 backdrop-blur">
              {alerts.map((alert) => (
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

  if (view === "alerts") {
    return (
      <AlertsScreen
        wheelchairName={selectedWheelchair?.name ?? "Wheelchair"}
        alerts={alerts}
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
            onClick={() => setView("alerts")}
            className="streaks-press flex flex-col items-center gap-4 text-center focus:outline-none"
          >
            <div className="streaks-tile grid aspect-square w-full max-w-[250px] place-items-center rounded-full bg-white/95 ring-8 ring-white/70 backdrop-blur">
              <div className="grid place-items-center">
                <div className="text-6xl font-semibold tracking-tight text-rose-500 sm:text-7xl">
                  {formatNumber(summary.totalAlerts)}
                </div>
                <div className="mt-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
                  Alerts
                </div>
              </div>
            </div>
            <div>
              <div className="text-base font-black uppercase tracking-tight text-zinc-950 sm:text-lg">
                Alerts
              </div>
              <div className="mt-1 text-sm font-semibold text-rose-500">
                View times
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setView("progress")}
            className="streaks-press flex flex-col items-center gap-4 text-center focus:outline-none"
          >
            <div className="streaks-tile grid aspect-square w-full max-w-[250px] place-items-center rounded-full bg-white/95 ring-8 ring-white/70 backdrop-blur">
              <div className="grid place-items-center">
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
                </div>
              </div>
            </div>
            <div>
              <div className="text-base font-black uppercase tracking-tight text-zinc-950 sm:text-lg">
                Insights
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-500">
                Guidance
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

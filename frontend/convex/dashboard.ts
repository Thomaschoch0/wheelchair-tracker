import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./users";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSummary(readings: Array<{
  leftForceRaw?: number;
  rightForceRaw?: number;
  timestamp: number;
}>) {
  const complete = readings.filter(
    (reading) =>
      typeof reading.leftForceRaw === "number" &&
      typeof reading.rightForceRaw === "number",
  );

  const leftAvg = Math.round(
    average(complete.map((reading) => reading.leftForceRaw ?? 0)),
  );
  const rightAvg = Math.round(
    average(complete.map((reading) => reading.rightForceRaw ?? 0)),
  );

  const imbalances = complete.map((reading) => {
    const left = reading.leftForceRaw ?? 0;
    const right = reading.rightForceRaw ?? 0;
    const total = Math.abs(left) + Math.abs(right);
    return total === 0 ? 0 : (Math.abs(left - right) / total) * 100;
  });

  const avgImbalancePct = average(imbalances);
  const totalAlerts = imbalances.filter((value) => value >= 12).length;
  const progressScore = Math.max(
    0,
    Math.min(100, Math.round(100 - avgImbalancePct * 3 - totalAlerts * 2)),
  );

  return {
    progressScore,
    avgImbalancePct,
    totalAlerts,
    pushes: {
      leftAvgN: leftAvg,
      rightAvgN: rightAvg,
    },
    latestTimestamp: readings[0]?.timestamp ?? null,
  };
}

function scoreReadings(readings: Array<{
  leftForceRaw?: number;
  rightForceRaw?: number;
}>) {
  const complete = readings.filter(
    (reading) =>
      typeof reading.leftForceRaw === "number" &&
      typeof reading.rightForceRaw === "number",
  );

  const imbalances = complete.map((reading) => {
    const left = reading.leftForceRaw ?? 0;
    const right = reading.rightForceRaw ?? 0;
    const total = Math.abs(left) + Math.abs(right);
    return total === 0 ? 0 : (Math.abs(left - right) / total) * 100;
  });

  const avgImbalancePct = average(imbalances);
  const totalAlerts = imbalances.filter((value) => value >= 12).length;

  return Math.max(
    0,
    Math.min(100, Math.round(100 - avgImbalancePct * 3 - totalAlerts * 2)),
  );
}

function trendLabel(timestamp: number, range: "day" | "week" | "month" | "year" | "all") {
  const date = new Date(timestamp);

  if (range === "day") {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (range === "year" || range === "all") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildTrend(
  readings: Array<{
    leftForceRaw?: number;
    rightForceRaw?: number;
    timestamp: number;
  }>,
  range: "day" | "week" | "month" | "year" | "all",
) {
  const now = Date.now();
  const rangeMs = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    all: Number.POSITIVE_INFINITY,
  }[range];
  const bucketMs = {
    day: 60 * 60 * 1000,
    week: 24 * 60 * 60 * 1000,
    month: 24 * 60 * 60 * 1000,
    year: 30 * 24 * 60 * 60 * 1000,
    all: 30 * 24 * 60 * 60 * 1000,
  }[range];
  const filtered = readings
    .filter((reading) => range === "all" || reading.timestamp >= now - rangeMs)
    .sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, typeof filtered>();

  for (const reading of filtered) {
    const bucket = Math.floor(reading.timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucket) ?? [];
    existing.push(reading);
    buckets.set(bucket, existing);
  }

  return Array.from(buckets.entries()).map(([timestamp, bucketReadings]) => ({
    timestamp,
    label: trendLabel(timestamp, range),
    score: scoreReadings(bucketReadings),
  }));
}

function buildAlerts(readings: Array<{
  _id: string;
  leftForceRaw?: number;
  rightForceRaw?: number;
  timestamp: number;
}>) {
  return readings
    .map((reading) => {
      const left = reading.leftForceRaw ?? 0;
      const right = reading.rightForceRaw ?? 0;
      const total = Math.abs(left) + Math.abs(right);
      const imbalancePct = total === 0 ? 0 : (Math.abs(left - right) / total) * 100;

      return {
        id: reading._id,
        timestamp: reading.timestamp,
        label: new Date(reading.timestamp).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        imbalancePct,
        leftForceRaw: reading.leftForceRaw,
        rightForceRaw: reading.rightForceRaw,
      };
    })
    .filter((alert) => alert.imbalancePct >= 12)
    .slice(0, 50);
}

function buildTrainingReadings(readings: Array<{
  _id: string;
  leftForceRaw?: number;
  rightForceRaw?: number;
  timestamp: number;
}>) {
  return readings
    .slice(0, 240)
    .map((reading) => ({
      id: reading._id,
      timestamp: reading.timestamp,
      leftForceRaw: reading.leftForceRaw ?? 0,
      rightForceRaw: reading.rightForceRaw ?? 0,
      totalForceRaw: (reading.leftForceRaw ?? 0) + (reading.rightForceRaw ?? 0),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export const getDashboard = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.sessionToken);

    if (!user) {
      return null;
    }

    const wheelchairs = await ctx.db
      .query("wheelchairs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const readingsByWheelchair = await Promise.all(
      wheelchairs.map(async (wheelchair) => {
        const readings = await ctx.db
          .query("sensorReadings")
          .withIndex("by_device_and_timestamp", (q) =>
            q.eq("deviceId", wheelchair.deviceId),
          )
          .order("desc")
          .take(2000);

        return {
          wheelchair,
          readings,
          summary: buildSummary(readings),
          trends: {
            day: buildTrend(readings, "day"),
            week: buildTrend(readings, "week"),
            month: buildTrend(readings, "month"),
            year: buildTrend(readings, "year"),
            all: buildTrend(readings, "all"),
          },
          alerts: buildAlerts(readings),
          trainingReadings: buildTrainingReadings(readings),
        };
      }),
    );

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      wheelchairs: readingsByWheelchair.map(({ wheelchair, summary, trends, alerts, trainingReadings }) => ({
        id: wheelchair._id,
        name: wheelchair.name,
        deviceId: wheelchair.deviceId,
        summary,
        trends,
        alerts,
        trainingReadings,
      })),
    };
  },
});

export const updateWheelchair = mutation({
  args: {
    sessionToken: v.string(),
    wheelchairId: v.id("wheelchairs"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.sessionToken);

    if (!user) {
      throw new Error("Please log in again.");
    }

    const wheelchair = await ctx.db.get(args.wheelchairId);

    if (!wheelchair || wheelchair.userId !== user._id) {
      throw new Error("Wheelchair not found.");
    }

    const name = args.name.trim();

    if (!name) {
      throw new Error("Please enter a wheelchair name.");
    }

    await ctx.db.patch(args.wheelchairId, { name });

    return { id: args.wheelchairId, name };
  },
});

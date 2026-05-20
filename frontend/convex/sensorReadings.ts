import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const insertReading = mutation({
  args: {
    deviceId: v.string(),

    leftForceRaw: v.optional(v.number()),
    rightForceRaw: v.optional(v.number()),

    source: v.string(),
    timestamp: v.number(),
  },

  handler: async (ctx, args) => {
    return await ctx.db.insert("sensorReadings", args);
  },
});

export const getLatestReadings = query({
  args: {
    deviceId: v.string(),
    limit: v.optional(v.number()),
  },

  handler: async (ctx, args) => {
    return await ctx.db
      .query("sensorReadings")
      .withIndex("by_device_and_timestamp", (q) =>
        q.eq("deviceId", args.deviceId)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});
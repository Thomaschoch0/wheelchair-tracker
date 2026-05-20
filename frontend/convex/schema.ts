import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  wheelchairs: defineTable({
    userId: v.id("users"),
    name: v.string(),
    deviceId: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_device", ["deviceId"]),

  sensorReadings: defineTable({
    deviceId: v.string(),

    leftForceRaw: v.optional(v.number()),
    rightForceRaw: v.optional(v.number()),

    source: v.string(),
    timestamp: v.number(),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_and_timestamp", ["deviceId", "timestamp"]),
});

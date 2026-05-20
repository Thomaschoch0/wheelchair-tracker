import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getUserBySession(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .unique();

  if (!session) {
    return null;
  }

  return await ctx.db.get(session.userId);
}

function publicUser(user: {
  _id: string;
  name: string;
  email: string;
  createdAt: number;
}) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export const signUp = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      throw new Error("An account with that email already exists.");
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: args.name.trim(),
      email,
      passwordHash: args.passwordHash,
      createdAt: now,
    });

    await ctx.db.insert("wheelchairs", {
      userId,
      name: "My wheelchair",
      deviceId: "wheelchair_001",
      createdAt: now,
    });

    await ctx.db.insert("sessions", {
      userId,
      token: args.sessionToken,
      createdAt: now,
    });

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Could not create account.");
    }

    return { user: publicUser(user), sessionToken: args.sessionToken };
  },
});

export const logIn = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user || user.passwordHash !== args.passwordHash) {
      throw new Error("Email or password is incorrect.");
    }

    await ctx.db.insert("sessions", {
      userId: user._id,
      token: args.sessionToken,
      createdAt: Date.now(),
    });

    return { user: publicUser(user), sessionToken: args.sessionToken };
  },
});

export const resetPassword = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      throw new Error("No account exists for that email.");
    }

    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
    });

    await ctx.db.insert("sessions", {
      userId: user._id,
      token: args.sessionToken,
      createdAt: Date.now(),
    });

    return { user: publicUser(user), sessionToken: args.sessionToken };
  },
});

export const getCurrentUser = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySession(ctx, args.sessionToken);
    return user ? publicUser(user) : null;
  },
});

export const logOut = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();

    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

export const getAuthenticatedUser = getUserBySession;

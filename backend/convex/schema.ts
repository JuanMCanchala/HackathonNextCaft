import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  threadMetadata: defineTable({
    threadId: v.string(),
    ownerSubject: v.optional(v.string()),
    title: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),
});

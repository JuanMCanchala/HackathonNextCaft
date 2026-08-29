import {
  createThread as createAgentThread,
  listMessages as listAgentMessages,
} from "@convex-dev/agent";
import { components } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { supportAgent } from "./agents";
import { normalizeMessage } from "./validation";

/** Create a persisted agent thread. Add auth identity checks before production use. */
export const createThread = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    // Auth-ready ownership hook: requireIdentity(ctx) and persist the subject here.
    const normalizedTitle = title?.trim();
    return await createAgentThread(
      ctx,
      components.agent,
      normalizedTitle ? { title: normalizedTitle } : undefined,
    );
  },
});

/** Generate a support response and persist both sides of the conversation. */
export const sendMessage = action({
  args: { threadId: v.string(), message: v.string() },
  handler: async (ctx, { threadId, message }) => {
    // Auth-ready ownership hook: authorize the caller can access threadId.
    const result = await supportAgent.generateText(
      ctx,
      { threadId },
      { prompt: normalizeMessage(message) },
    );
    return { text: result.text };
  },
});

/** Continue an existing thread with another user prompt. */
export const continueThread = action({
  args: { threadId: v.string(), message: v.string() },
  handler: async (ctx, { threadId, message }) => {
    // Auth-ready ownership hook: authorize the caller can access threadId.
    const { thread } = await supportAgent.continueThread(ctx, { threadId });
    const result = await thread.generateText({ prompt: normalizeMessage(message) });
    return { text: result.text };
  },
});

/** Read persisted messages. Add ownership filtering before exposing this publicly. */
export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: v.optional(
      v.object({
        cursor: v.union(v.string(), v.null()),
        numItems: v.number(),
      }),
    ),
  },
  handler: async (ctx, { threadId, paginationOpts }) => {
    // Auth-ready ownership hook: authorize the caller can access threadId.
    return await listAgentMessages(ctx, components.agent, {
      threadId,
      paginationOpts: paginationOpts ?? { cursor: null, numItems: 50 },
      excludeToolMessages: true,
    });
  },
});

import { normalizeMessage } from "../convex/validation";

describe("normalizeMessage", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeMessage("  hello\n   world  ")).toBe("hello world");
  });

  it("rejects blank messages", () => {
    expect(() => normalizeMessage(" \n\t ")).toThrow("Message cannot be empty.");
  });
});

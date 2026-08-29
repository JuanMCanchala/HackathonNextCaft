import authConfig from "../convex/auth.config";

describe("auth.config Clerk wiring", () => {
  it("declares a Clerk JWT provider with domain and applicationID", () => {
    expect(authConfig.providers).toHaveLength(1);
    const provider = authConfig.providers[0];
    expect(provider).toEqual(
      expect.objectContaining({
        domain: expect.any(String),
        applicationID: expect.any(String),
      }),
    );
    expect(provider?.domain.length).toBeGreaterThan(0);
    expect(provider?.applicationID.length).toBeGreaterThan(0);
  });
});

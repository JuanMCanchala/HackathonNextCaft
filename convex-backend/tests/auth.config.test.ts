describe("auth.config Clerk wiring", () => {
  beforeAll(() => {
    process.env.CLERK_JWT_ISSUER_DOMAIN =
      "https://premium-humpback-2836.clerk.accounts.dev";
    process.env.CLERK_JWT_APPLICATION_ID = "convex";
  });

  it("declares a Clerk JWT provider with domain and applicationID", async () => {
    const { default: authConfig } = await import("../convex/auth.config");
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

import { describe, expect, it } from "vitest";

describe("Supabase web configuration", () => {
  it("can reach the configured Supabase auth endpoint with the public anon key", async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    expect(url).toMatch(/^https:\/\//);
    expect(anonKey).toBeTruthy();
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey! } });
    expect(response.ok).toBe(true);
  }, 15000);
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRedirect, mockSignUp, mockCreateClient } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockSignUp: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/features/auth/lib/supabase-server", () => ({
  createClient: mockCreateClient,
}));

import { isSignupAllowed } from "@/features/auth/lib/signup-guard";
import { signup } from "@/features/auth/lib/actions";

describe("ALLOW_SIGNUP guard", () => {
  const originalAllowSignup = process.env.ALLOW_SIGNUP;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({
      auth: { signUp: mockSignUp },
    });
  });

  afterEach(() => {
    if (originalAllowSignup === undefined) {
      delete process.env.ALLOW_SIGNUP;
    } else {
      process.env.ALLOW_SIGNUP = originalAllowSignup;
    }
  });

  it("defaults to closed and rejects signup before calling Supabase", async () => {
    delete process.env.ALLOW_SIGNUP;
    expect(isSignupAllowed()).toBe(false);

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "secret123");

    await signup(formData);

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith(
      "/signup?error=" + encodeURIComponent("Registration is closed.")
    );
  });

  it("allows signup and calls Supabase when ALLOW_SIGNUP=true", async () => {
    process.env.ALLOW_SIGNUP = "true";
    expect(isSignupAllowed()).toBe(true);

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "secret123");

    await signup(formData);

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret123",
    });
    expect(mockRedirect).toHaveBeenCalledWith(
      "/login?message=" + encodeURIComponent("Check your email for a confirmation link.")
    );
  });
});

export function isSignupAllowed(): boolean {
  return process.env.ALLOW_SIGNUP === "true";
}

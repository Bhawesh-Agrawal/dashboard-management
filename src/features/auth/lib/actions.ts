"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/features/auth/lib/supabase-server";
import { isSignupAllowed } from "@/features/auth/lib/signup-guard";
import { sanitizeReturnUrl } from "@/features/auth/lib/return-url";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const returnUrl = sanitizeReturnUrl(formData.get("returnUrl") as string | null);

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    const returnParam =
      returnUrl !== "/today" ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "";
    redirect("/login?error=" + encodeURIComponent(error.message) + returnParam);
  }

  redirect(returnUrl);
}

export async function signup(formData: FormData) {
  if (!isSignupAllowed()) {
    redirect("/signup?error=" + encodeURIComponent("Registration is closed."));
    return;
  }

  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signUp(data);

  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  redirect("/login?message=" + encodeURIComponent("Check your email for a confirmation link."));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

import { createClient } from "@supabase/supabase-js";
import type { Env } from "./config/env";

/**
 * Create Supabase client for authentication
 */
export function createSupabaseClient(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Generate Google OAuth URL via Supabase
 */
export async function getSupabaseGoogleOAuthUrl(env: Env, state: string): Promise<string> {
  const supabase = createSupabaseClient(env);
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "https://www.googleapis.com/auth/calendar",
      redirectTo: `${env.PUBLIC_BASE_URL}/oauth/google-calendar/callback`,
      queryParams: {
        state, // Pass our state for validation
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    throw new Error(`Failed to generate OAuth URL: ${error?.message || "No URL returned"}`);
  }

  return data.url;
}

/**
 * Exchange Supabase auth code for Google tokens
 */
export async function exchangeSupabaseCodeForTokens(
  env: Env,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; supabaseRefreshToken: string; expiresIn: number }> {
  const supabase = createSupabaseClient(env);

  // Exchange code for session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    throw new Error(`Failed to exchange code: ${error?.message || "No session returned"}`);
  }

  // Extract Google tokens from provider token
  const accessToken = data.session.provider_token;
  const providerRefreshToken = data.session.provider_refresh_token;
  const supabaseRefreshToken = data.session.refresh_token;
  const expiresIn = data.session.expires_in || 3600;

  if (!accessToken) {
    throw new Error("No access token in session");
  }

  return {
    accessToken,
    // Store the Supabase refresh token (not the Google one) for later refresh
    refreshToken: supabaseRefreshToken || "",
    supabaseRefreshToken: supabaseRefreshToken || "",
    expiresIn,
  };
}


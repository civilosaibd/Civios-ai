import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { isManagedOAuthHost, LOVABLE_SIGNIN_ORIGIN } from "@/lib/oauthHost";
import { clearStoredReferral, referralForSignup } from "@/lib/referral";

import { toast } from "sonner";
import CivilOSLogo from "@/components/CivilOSLogo";

const AuthPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const oauthCallbackHandled = useRef(false);
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" || referralForSignup(window.location.search) ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState<string | null>(null);


  // Record one referral-link landing per browser session and referral code.
  // This measures in-product link visits, not verified human reach or external shares.
  const referralCode = params.get("ref")?.trim() || "";
  useEffect(() => {
    if (!referralCode || !/^[A-Z0-9-]{4,32}$/i.test(referralCode)) return;
    const storageKey = `civilos.referral.click.${referralCode.toUpperCase()}`;
    let eventId = sessionStorage.getItem(storageKey);
    if (!eventId) {
      eventId = crypto.randomUUID();
      sessionStorage.setItem(storageKey, eventId);
    }
    void supabase.functions.invoke("track-referral-event", {
      body: { referralCode, eventType: "link_click", eventId },
    });
  }, [referralCode]);


  // Supabase normally restores the OAuth session automatically. On custom domains,
  // explicitly complete a pending PKCE callback if the automatic URL handler did
  // not restore a session, then leave /auth instead of showing the auth form again.
  useEffect(() => {
    const callbackUrl = new URL(window.location.href);
    const callbackError =
      callbackUrl.searchParams.get("error_description") || callbackUrl.searchParams.get("error");
    if (callbackError && !oauthCallbackHandled.current) {
      oauthCallbackHandled.current = true;
      sessionStorage.removeItem("civilos.auth.redirect");
      toast.error(callbackError.replace(/\+/g, " "));
      navigate("/auth", { replace: true });
      return;
    }

    const code = callbackUrl.searchParams.get("code");
    if (!code || oauthCallbackHandled.current) return;
    oauthCallbackHandled.current = true;

    const completeOAuthCallback = async () => {
      try {
        // Give Supabase's built-in URL callback handler a moment to finish first.
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const { data: current, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        let session = current.session;
        if (!session) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        }
        if (!session?.user) {
          throw new Error("Google sign-in did not create an active session. Please try again.");
        }

        const stashed = sessionStorage.getItem("civilos.auth.redirect");
        sessionStorage.removeItem("civilos.auth.redirect");
        navigate(safeRedirect(params.get("redirect") || stashed), { replace: true });
      } catch (err: unknown) {
        sessionStorage.removeItem("civilos.auth.redirect");
        const message = err instanceof Error ? err.message : "Google sign-in could not be completed.";
        toast.error(message);
      }
    };

    void completeOAuthCallback();
  }, [navigate, params]);

  useEffect(() => {
    if (!user) return;
    // After OAuth round-trip the ?redirect param may be gone; fall back to the
    // stashed destination saved before the browser left for Google.
    const stashed = sessionStorage.getItem("civilos.auth.redirect");
    sessionStorage.removeItem("civilos.auth.redirect");
    navigate(safeRedirect(params.get("redirect") || stashed), { replace: true });
  }, [user, navigate, params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        // ?ref= from the URL, or the code remembered from an earlier landing page (civilos_referral_code)
        const ref = referralForSignup(window.location.search);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${safeRedirect(params.get("redirect"))}`,
            data: { display_name: displayName || email.trim().split("@")[0], ref },
          },
        });
        if (error) throw error;
        clearStoredReferral();

        // With Supabase email confirmations enabled, signUp succeeds without a session.
        // Never tell users they are signed in until they verify their mailbox.
        if (!data.session) {
          setVerificationPending(email.trim());
          toast.success("Verification email sent. Check your inbox to activate your account.");
        } else {
          setVerificationPending(null);
          toast.success("Account created successfully.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (!verificationPending) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: verificationPending,
        options: {
          emailRedirectTo: `${window.location.origin}${safeRedirect(params.get("redirect"))}`,
        },
      });
      if (error) throw error;
      toast.success("A new verification email has been sent.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not resend verification email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12">
        <div className="w-full max-w-md mx-auto bg-card rounded-2xl shadow-card p-8 space-y-6">
          <div className="text-center space-y-2">
            <CivilOSLogo variant="full" size="lg" showTagline className="justify-center" />
            <h1 className="font-heading text-2xl font-bold">
              {mode === "signin" ? "Sign in to your account" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Save your house designs, estimates, and BNBC reports.
            </p>
          </div>

          {verificationPending && mode === "signup" && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" role="status" aria-live="polite">
              <h2 className="font-semibold">Verify your email address</h2>
              <p className="text-sm text-muted-foreground">
                We sent a verification link to <strong className="break-all">{verificationPending}</strong>.
                Open that email and click the link before signing in. Check your spam/junk folder too.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={resendVerificationEmail} disabled={loading}>
                {loading ? "Sending…" : "Resend verification email"}
              </Button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Md Zobaer Hasan" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={async () => {
              const redirect = safeRedirect(params.get("redirect"));
              setLoading(true);
              try {
                // Save the destination before leaving for Google; AuthPage restores it
                // after Supabase returns to this exact domain.
                sessionStorage.setItem("civilos.auth.redirect", redirect);
                if (isManagedOAuthHost()) {
                  // Lovable-managed OAuth is required on Lovable-hosted origins.
                  const result = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: `${window.location.origin}/auth`,
                    extraParams: { prompt: "select_account" },
                  });
                  if (result.error) throw result.error;
                  if (result.redirected) return;
                  navigate(redirect, { replace: true });
                } else {
                  // Vercel/custom domains must use this project's Supabase Google
                  // provider directly instead of bouncing users to lovable.app.
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                      redirectTo: `${window.location.origin}/auth`,
                      queryParams: { prompt: "select_account" },
                    },
                  });
                  if (error) throw error;
                }
              } catch (err: any) {
                sessionStorage.removeItem("civilos.auth.redirect");
                toast.error(err?.message || "Google sign-in failed");
              } finally {
                setLoading(false);
              }
            }}
          >

            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.1 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </Button>


          <div className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>New here? <button type="button" onClick={() => setMode("signup")} className="text-accent font-medium hover:underline">Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => setMode("signin")} className="text-accent font-medium hover:underline">Sign in</button></>
            )}
          </div>
          <div className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">← Back to home</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AuthPage;

function safeRedirect(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

// RD-Pro — Password Reset landing page.
//
// Reached only via the link Supabase emails from resetPasswordForEmail()
// (see src/pages/Auth.tsx's handleForgotPassword, redirectTo:
// `${origin}/auth/reset-password`). Supabase's client (detectSessionInUrl
// defaults to true) parses the recovery token out of the URL on load and
// fires a PASSWORD_RECOVERY auth event — that event, not any credential we
// hold, is what unlocks the "set new password" form below. An invalid or
// expired link instead carries an error in the URL, or simply never fires
// that event; both are handled explicitly so this page never renders blank.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AuthWatermark } from "@/components/auth/AuthBackground";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordRules, isStrongPassword } from "@/lib/passwordRules";

const resetPasswordSchema = z
  .object({
    password: z.string().refine(isStrongPassword, "Password does not meet the strength rules"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

type FlowState = "verifying" | "ready" | "invalid" | "success";

/** How long to wait for Supabase's PASSWORD_RECOVERY event before treating the link as dead rather than leaving the page stuck on "Verifying...". */
const RECOVERY_LINK_TIMEOUT_MS = 8000;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [flowState, setFlowState] = useState<FlowState>("verifying");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Reset Password — RD Pro";
  }, []);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordValue = form.watch("password");
  const passwordChecks = useMemo(
    () => passwordRules.map((rule) => ({ ...rule, passed: rule.test(passwordValue || "") })),
    [passwordValue]
  );

  useEffect(() => {
    // An invalid/expired link redirects back here with an error instead of
    // a token — Supabase puts it in the hash (implicit flow) or query
    // string depending on how the link failed. Check both, fail fast.
    const params = new URLSearchParams(window.location.hash ? window.location.hash.slice(1) : window.location.search);
    const errorDescription = params.get("error_description") || params.get("error");
    if (errorDescription) {
      setInvalidReason(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      setFlowState("invalid");
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setFlowState("ready");
      }
    });

    // Fallback for the rare case the recovery session was already
    // established (and the event already fired) before this listener
    // attached — a session being present at all on this page means the
    // link's token was valid.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setFlowState((prev) => (prev === "verifying" ? "ready" : prev));
    });

    const timeout = setTimeout(() => {
      setFlowState((prev) => {
        if (prev !== "verifying") return prev;
        setInvalidReason("This reset link is invalid or has expired.");
        return "invalid";
      });
    }, RECOVERY_LINK_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      toast.success("Password updated successfully.", {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      });
      setFlowState("success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not update password. Please try again.";
      toast.error(message, {
        icon: <XCircle className="h-5 w-5 text-red-500" />,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToLogin = async () => {
    // The recovery link leaves an active session behind — sign out so the
    // user lands on a clean login screen and signs in fresh with the new
    // password, instead of being silently auto-logged-in via the old
    // recovery session.
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="relative isolate h-screen overflow-y-auto overflow-x-hidden auth-bg-wash">
      <div className="auth-wash-drift pointer-events-none fixed inset-0 -z-10" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden sm:block">
        <AuthWatermark className="auth-bg-drift auth-bg-watermark h-full w-full opacity-70 lg:opacity-100" />
      </div>

      <div className="flex min-h-full flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-[420px]">
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="auth-logo-glow pointer-events-none absolute inset-0 -z-10 scale-150" />
              <img src="/icons/icon-128x128.png" alt="RD Pro" className="w-16 h-16 rounded-2xl shadow-lg" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reset Your Password</h1>
            <p className="text-sm text-slate-500 mt-1">Business Operating System</p>
          </div>

          <div className="relative isolate">
            <div className="auth-card-glow pointer-events-none absolute inset-x-6 -inset-y-4 -z-10" />
            <div className="auth-card rounded-2xl border p-6 md:p-8">
              {flowState === "verifying" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <LoadingSpinner size="lg" />
                  <p className="text-slate-500 text-sm">Verifying your reset link...</p>
                </div>
              )}

              {flowState === "invalid" && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <XCircle className="h-10 w-10 text-red-500" />
                  <div>
                    <h2 className="font-semibold text-slate-900">Link invalid or expired</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {invalidReason ?? "This password reset link is invalid or has expired."} Request a new one from the login page.
                    </p>
                  </div>
                  <Button
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
                    onClick={() => navigate("/auth", { replace: true })}
                  >
                    Back to Login
                  </Button>
                </div>
              )}

              {flowState === "success" && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                  <div>
                    <h2 className="font-semibold text-slate-900">Password updated</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Your password has been changed. Sign in with your new password to continue.
                    </p>
                  </div>
                  <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl" onClick={goToLogin}>
                    Go to Login
                  </Button>
                </div>
              )}

              {flowState === "ready" && (
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password" className="text-sm font-medium text-slate-700">
                      New Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        {...form.register("password")}
                        className={`pl-9 pr-10 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                          form.formState.errors.password ? "border-red-400" : ""
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-2">
                      {passwordChecks.map((rule) => (
                        <span key={rule.label} className={`flex items-center gap-1 ${rule.passed ? "text-green-600" : ""}`}>
                          {rule.passed ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                          {rule.label}
                        </span>
                      ))}
                    </div>
                    {form.formState.errors.password && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                      Confirm New Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter your new password"
                        autoComplete="new-password"
                        {...form.register("confirmPassword")}
                        className={`pl-9 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                          form.formState.errors.confirmPassword ? "border-red-400" : ""
                        }`}
                      />
                    </div>
                    {form.formState.errors.confirmPassword && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl mt-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Update Password
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

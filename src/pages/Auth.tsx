import { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  Languages,
  Loader2,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const COUNTRIES = ["India", "USA", "UAE", "UK", "Singapore", "Australia"] as const;
const LANGUAGES = ["English", "Hindi", "Tamil", "Gujarati", "Bengali"] as const;

const countryMobileRules: Record<(typeof COUNTRIES)[number], RegExp> = {
  India: /^[6-9]\d{9}$/,
  USA: /^[2-9]\d{2}[2-9]\d{6}$/,
  UAE: /^5\d{8}$/,
  UK: /^7\d{9}$/,
  Singapore: /^[689]\d{7}$/,
  Australia: /^4\d{8}$/,
};

const normalizeMobile = (value: string) => value.replace(/[^\d]/g, "");

const passwordRules = [
  { label: "8 characters", test: (value: string) => value.length >= 8 },
  { label: "1 uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { label: "1 lowercase", test: (value: string) => /[a-z]/.test(value) },
  { label: "1 number", test: (value: string) => /\d/.test(value) },
  { label: "1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

const isStrongPassword = (value: string) => passwordRules.every((rule) => rule.test(value));

const loginSchema = z.object({
  email: z.string().email("Valid email address required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100, "Full name must be 100 characters or less"),
    mobile: z.string().trim().min(1, "Mobile number is required"),
    email: z.string().trim().email("Valid email address required"),
    password: z.string().refine(isStrongPassword, "Password does not meet the strength rules"),
    country: z.enum(COUNTRIES, { required_error: "Country is required" }),
    language: z.enum(LANGUAGES, { required_error: "Preferred language is required" }),
    termsAccepted: z.boolean().refine((value) => value === true, "Terms & Privacy Policy acceptance is required"),
    companyName: z.string().optional(),
    formStartedAt: z.number(),
  })
  .superRefine((data, ctx) => {
    const mobile = normalizeMobile(data.mobile);
    if (!countryMobileRules[data.country].test(mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mobile"],
        message: `Enter a valid mobile number for ${data.country}`,
      });
    }
    if (data.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Signup could not be verified. Please try again.",
      });
    }
    if (Date.now() - data.formStartedAt < 2500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Please wait a moment before creating your account.",
      });
    }
  });

type LoginFormData = z.infer<typeof loginSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [pendingOtpRedirect, setPendingOtpRedirect] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    mode: "onChange",
    defaultValues: {
      fullName: "",
      mobile: "",
      email: "",
      password: "",
      country: "India",
      language: "English",
      termsAccepted: false,
      companyName: "",
      formStartedAt: Date.now(),
    },
  });

  const selectedCountry = signUpForm.watch("country");
  const passwordValue = signUpForm.watch("password");
  const passwordChecks = useMemo(
    () => passwordRules.map((rule) => ({ ...rule, passed: rule.test(passwordValue || "") })),
    [passwordValue],
  );

  useEffect(() => {
    loginForm.reset();
    signUpForm.reset({
      fullName: "",
      mobile: "",
      email: "",
      password: "",
      country: "India",
      language: "English",
      termsAccepted: false,
      companyName: "",
      formStartedAt: Date.now(),
    });
    setShowPassword(false);
  }, [isSignUp]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (user && !pendingOtpRedirect) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;
      toast.success("Login successful. Welcome back!", {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      });
    } catch (error: any) {
      toast.error(error.message || "Login failed. Please try again.", {
        icon: <XCircle className="h-5 w-5 text-red-500" />,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setIsLoading(true);
    try {
      const normalizedMobile = normalizeMobile(data.mobile);
      const { data: availability, error: availabilityError } = await supabase.rpc(
        "check_signup_contact_available",
        {
          _email: data.email.toLowerCase(),
          _mobile: normalizedMobile,
        },
      );

      if (availabilityError) throw availabilityError;
      if (availability && typeof availability === "object" && !Array.isArray(availability)) {
        const result = availability as { email_available?: boolean; mobile_available?: boolean };
        if (result.email_available === false) {
          signUpForm.setError("email", { message: "An account with this email already exists" });
          throw new Error("An account with this email already exists");
        }
        if (result.mobile_available === false) {
          signUpForm.setError("mobile", { message: "An account with this mobile number already exists" });
          throw new Error("An account with this mobile number already exists");
        }
      }

      setPendingOtpRedirect(true);
      const { error } = await supabase.auth.signUp({
        email: data.email.toLowerCase(),
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-otp`,
          data: {
            full_name: data.fullName.trim(),
            mobile: normalizedMobile,
            country: data.country,
            language: data.language,
            terms_accepted: data.termsAccepted,
            otp_required: true,
          },
        },
      });
      if (error) throw error;

      toast.success("Account created. Please verify your OTP to continue.", {
        duration: 7000,
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      });
      navigate("/verify-otp", {
        replace: true,
        state: { email: data.email.toLowerCase(), mobile: normalizedMobile },
      });
    } catch (error: any) {
      setPendingOtpRedirect(false);
      toast.error(error.message || "Sign up failed. Please try again.", {
        icon: <XCircle className="h-5 w-5 text-red-500" />,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: "google" | "azure") => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/verify-otp`,
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Social signup failed. Please try again.", {
        icon: <XCircle className="h-5 w-5 text-red-500" />,
      });
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !z.string().email().safeParse(forgotEmail).success) {
      toast.error("Please enter a valid email address.", {
        icon: <AlertCircle className="h-5 w-5 text-amber-500" />,
      });
      return;
    }
    setIsForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent! Please check your email.", {
        duration: 6000,
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      });
      setIsForgotOpen(false);
      setForgotEmail("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset link. Please try again.", {
        icon: <XCircle className="h-5 w-5 text-red-500" />,
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 overflow-x-hidden">
      <div className={`w-full ${isSignUp ? "max-w-[760px]" : "max-w-[420px]"}`}>
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome To RD-PRO</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSignUp ? "Start Your 14 Days Free Trial" : "Sign in to your account"}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => setIsSignUp(false)}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                !isSignUp ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                isSignUp ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Signup
            </button>
          </div>

          {!isSignUp && (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-sm font-medium text-slate-700">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    {...loginForm.register("email")}
                    className={`pl-9 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                      loginForm.formState.errors.email ? "border-red-400" : ""
                    }`}
                  />
                </div>
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                    Password
                  </Label>
                  <Dialog open={isForgotOpen} onOpenChange={setIsForgotOpen}>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline focus:outline-none"
                      >
                        Forgot Password?
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[400px] bg-white border border-slate-200 rounded-2xl">
                      <form onSubmit={handleForgotPassword}>
                        <DialogHeader>
                          <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-blue-600" />
                            Reset Password
                          </DialogTitle>
                          <DialogDescription className="text-slate-500 text-sm mt-1">
                            Enter your email address and we'll send you a link to reset your password.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="forgotEmail" className="text-sm font-medium text-slate-700">
                              Email Address
                            </Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <Input
                                id="forgotEmail"
                                type="email"
                                placeholder="you@example.com"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                className="pl-9 h-11 border-slate-300 focus:border-blue-500"
                                required
                              />
                            </div>
                          </div>
                        </div>
                        <DialogFooter className="gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsForgotOpen(false)}
                            className="border-slate-300 text-slate-700"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={isForgotLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isForgotLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              "Send Reset Link"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    {...loginForm.register("password")}
                    className={`pl-9 pr-10 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                      loginForm.formState.errors.password ? "border-red-400" : ""
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
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
          )}

          {isSignUp && (
            <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
              <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...signUpForm.register("companyName")} />
              <input type="hidden" {...signUpForm.register("formStartedAt", { valueAsNumber: true })} />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-sm font-medium text-slate-700">
                    Full Name *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Your full name"
                      autoComplete="name"
                      {...signUpForm.register("fullName")}
                      className={`pl-9 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                        signUpForm.formState.errors.fullName ? "border-red-400" : ""
                      }`}
                    />
                  </div>
                  {signUpForm.formState.errors.fullName && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {signUpForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mobile" className="text-sm font-medium text-slate-700">
                    Mobile Number *
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="mobile"
                      type="tel"
                      placeholder={selectedCountry === "India" ? "10-digit mobile number" : "Mobile number"}
                      autoComplete="tel"
                      {...signUpForm.register("mobile")}
                      className={`pl-9 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                        signUpForm.formState.errors.mobile ? "border-red-400" : ""
                      }`}
                    />
                  </div>
                  {signUpForm.formState.errors.mobile && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {signUpForm.formState.errors.mobile.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-sm font-medium text-slate-700">
                    Email Address *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...signUpForm.register("email")}
                      className={`pl-9 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                        signUpForm.formState.errors.email ? "border-red-400" : ""
                      }`}
                    />
                  </div>
                  {signUpForm.formState.errors.email && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {signUpForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-sm font-medium text-slate-700">
                    Password *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      {...signUpForm.register("password")}
                      className={`pl-9 pr-10 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                        signUpForm.formState.errors.password ? "border-red-400" : ""
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
                  {signUpForm.formState.errors.password && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {signUpForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Country *</Label>
                  <Select
                    value={signUpForm.watch("country")}
                    onValueChange={(value) => signUpForm.setValue("country", value as SignUpFormData["country"], { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-11 border-slate-300 focus:border-blue-500">
                      <span className="flex items-center gap-2">
                        <Globe2 className="h-4 w-4 text-slate-400" />
                        <SelectValue placeholder="Select country" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {signUpForm.formState.errors.country && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {signUpForm.formState.errors.country.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Preferred Language *</Label>
                  <Select
                    value={signUpForm.watch("language")}
                    onValueChange={(value) => signUpForm.setValue("language", value as SignUpFormData["language"], { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-11 border-slate-300 focus:border-blue-500">
                      <span className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-slate-400" />
                        <SelectValue placeholder="Select language" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {signUpForm.formState.errors.language && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {signUpForm.formState.errors.language.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <Checkbox
                    checked={signUpForm.watch("termsAccepted")}
                    onCheckedChange={(checked) =>
                      signUpForm.setValue("termsAccepted", checked === true, { shouldValidate: true })
                    }
                    className="mt-0.5"
                  />
                  <span>I agree to Terms & Privacy Policy</span>
                </label>
                {signUpForm.formState.errors.termsAccepted && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {signUpForm.formState.errors.termsAccepted.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => handleSocialSignIn("google")}
                  className="h-11 w-full border-slate-300 text-slate-700"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Continue With Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => handleSocialSignIn("azure")}
                  className="h-11 w-full border-slate-300 text-slate-700"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Continue With Microsoft
                </Button>
              </div>
            </form>
          )}

          <div className="mt-5 text-center border-t border-slate-100 pt-5">
            {isSignUp ? (
              <p className="text-sm text-slate-600">
                Already have account?{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className="text-blue-600 font-semibold hover:underline focus:outline-none"
                >
                  Login
                </button>
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                New User?{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="text-blue-600 font-semibold hover:underline focus:outline-none"
                >
                  Create Account
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by RD-PRO &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

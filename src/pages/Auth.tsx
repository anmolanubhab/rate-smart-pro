import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  User,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const loginSchema = z.object({
  email: z.string().email("Valid email address required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Valid email address required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", mobile: "", email: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    loginForm.reset();
    signUpForm.reset();
    setShowPassword(false);
    setShowConfirmPassword(false);
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

  if (user) {
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
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: {
            full_name: data.fullName,
            mobile: data.mobile,
          },
        },
      });
      if (error) throw error;

      if (signUpData.user && signUpData.session === null) {
        toast.success("Account created! Please check your email to verify your account.", {
          duration: 8000,
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        });
      } else {
        toast.success("Account created successfully! Let's set up your company.", {
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        });
        navigate("/setup/business");
      }
    } catch (error: any) {
      toast.error(error.message || "Sign up failed. Please try again.", {
        icon: <XCircle className="h-5 w-5 text-red-500" />,
      });
    } finally {
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo & Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RD Pro</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSignUp ? "Create your account" : "Sign in to your account"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8">

          {/* LOGIN FORM */}
          {!isSignUp && (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              {/* Email */}
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

              {/* Password */}
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

              {/* Login Button */}
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

          {/* SIGNUP FORM */}
          {isSignUp && (
            <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-sm font-medium text-slate-700">
                  Full Name
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

              {/* Mobile Number */}
              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-sm font-medium text-slate-700">
                  Mobile Number
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="mobile"
                    type="tel"
                    placeholder="10-digit mobile number"
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

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="text-sm font-medium text-slate-700">
                  Email Address
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

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="text-sm font-medium text-slate-700">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
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
                {signUpForm.formState.errors.password && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {signUpForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    {...signUpForm.register("confirmPassword")}
                    className={`pl-9 pr-10 h-11 border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${
                      signUpForm.formState.errors.confirmPassword ? "border-red-400" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {signUpForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {signUpForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* Create Account Button */}
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
            </form>
          )}

          {/* Toggle Login / Signup */}
          <div className="mt-5 text-center border-t border-slate-100 pt-5">
            {isSignUp ? (
              <p className="text-sm text-slate-600">
                Already have an account?{" "}
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

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by RD Pro &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

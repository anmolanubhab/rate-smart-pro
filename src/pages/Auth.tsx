import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  Loader2, 
  Cpu, 
  Github, 
  Chrome, 
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  KeyRound
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";

const authSchema = z.object({
  email: z.string().email("Please enter a valid premium enterprise email address"),
  password: z.string().min(8, "Security protocols require at least 8 characters"),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    }
  });

  useEffect(() => {
    reset();
    setPasswordValue("");
  }, [isSignUp, reset]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(147,51,234,0.08),transparent_50%)]" />
        <div className="flex flex-col items-center gap-4 z-10">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-t-2 border-b-2 border-cyan-500 animate-spin" />
            <Cpu className="absolute inset-0 m-auto h-6 w-6 text-purple-400 animate-pulse" />
          </div>
          <p className="text-zinc-400 text-sm font-medium tracking-widest animate-pulse uppercase">Syncing Neural Core...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleAuth = async (data: AuthFormData) => {
    setIsLoading(true);
    try {
      if (isSignUp) {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error) throw error;
        
        if (signUpData.user && signUpData.session === null) {
          toast.success("Verification node deployed. Check your email payload to activate access.", {
            duration: 8000,
            icon: <CheckCircle2 className="h-5 w-5 text-cyan-400" />,
          });
        } else {
          toast.success("Identity established. Welcome to the workspace.", {
            icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;
        toast.success("Authentication sequence complete. Access granted.", {
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
        });
      }
    } catch (error: any) {
      toast.error(error.message || "An unhandled execution error has occurred.", {
        icon: <XCircle className="h-5 w-5 text-rose-500" />,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !z.string().email().safeParse(forgotEmail).success) {
      toast.error("Provide a verified email endpoint address.", {
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
      toast.success("Quantum reset transmission routed. Check your transmission terminal inbox.", {
        duration: 6000,
        icon: <CheckCircle2 className="h-5 w-5 text-cyan-400" />,
      });
      setIsForgotOpen(false);
      setForgotEmail("");
    } catch (error: any) {
      toast.error(error.message || "Failed to initialize cryptographic reset vector.", {
        icon: <XCircle className="h-5 w-5 text-rose-500" />,
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleSocialPlaceholder = (provider: string) => {
    toast.info(`${provider} OAuth pipeline is ready for binding in production matrix.`, {
      icon: <KeyRound className="h-5 w-5 text-purple-400" />,
    });
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "Empty Matrix", color: "bg-zinc-800" };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    switch (score) {
      case 1: return { score: 25, label: "Vulnerable Node", color: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" };
      case 2: return { score: 50, label: "Standard Defenses", color: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" };
      case 3: return { score: 75, label: "Hardened Core", color: "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" };
      case 4: return { score: 100, label: "Quantum Impervious", color: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" };
      default: return { score: 0, label: "Empty Matrix", color: "bg-zinc-800" };
    }
  };

  const strength = getPasswordStrength(passwordValue);

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-100 flex flex-col justify-between items-center p-4 md:p-8 relative overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Cyber-Grid Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-[0.12]" />
      
      {/* Dynamic Blurred Core Emitters */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-br from-cyan-600/20 to-blue-800/0 rounded-full blur-[130px] animate-[pulse_12s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-gradient-to-tl from-purple-600/20 to-fuchsia-800/0 rounded-full blur-[130px] animate-[pulse_12s_ease-in-out_infinite_2s]" />

      <div className="w-full max-w-[460px] my-auto relative z-10">
        {/* Animated Glow Logo Space */}
        <div className="flex flex-col items-center mb-8 group">
          <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900/50 border border-zinc-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-700 group-hover:border-cyan-500/50 group-hover:shadow-[0_0_40px_rgba(6,182,212,0.25)]">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-[8px] -z-10" />
            <Cpu className="h-7 w-7 text-transparent bg-clip-text bg-gradient-to-tr from-cyan-400 via-blue-400 to-purple-400 group-hover:rotate-180 transition-transform duration-1000" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400">
            SPARE PARTS OMS
          </h2>
          <p className="text-xs text-zinc-500 mt-1 uppercase tracking-[0.25em] font-semibold mix-blend-plus-lighter">
            Enterprise Logistics Engine
          </p>
        </div>

        {/* Premium Dark Glassmorphism Card Hull */}
        <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-950/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-2xl p-6 md:p-8 overflow-hidden transition-all duration-500 hover:border-zinc-700/60">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
          <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-purple-500/30 blur-[1px]" />

          {/* Smooth Mode Select Row */}
          <div className="relative flex bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80 mb-6 group-hover:border-zinc-700/40 transition-colors">
            <div 
              className={`absolute top-1 bottom-1 rounded-lg bg-gradient-to-r from-zinc-800 to-zinc-800/90 border border-zinc-700/30 shadow-inner transition-all duration-300 ease-out ${
                isSignUp ? "left-[50%] right-1" : "left-1 right-[50%]"
              }`} 
            />
            <button
              type="button"
              onClick={() => setIsSignUp(false)}
              className={`relative z-10 flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
                !isSignUp ? "text-cyan-400" : "text-zinc-400 hover:text-zinc-200"
              }`}
              aria-label="Switch to identity authentication portal"
            >
              Secure Access
            </button>
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              className={`relative z-10 flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
                isSignUp ? "text-purple-400" : "text-zinc-400 hover:text-zinc-200"
              }`}
              aria-label="Switch to credential initialization matrix"
            >
              Provision Node
            </button>
          </div>

          <form onSubmit={handleSubmit(handleAuth)} className="space-y-4">
            {/* Input Email Block */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium tracking-wide text-zinc-400">
                Network Identifier
              </Label>
              <div className="relative group/input">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within/input:text-cyan-400 transition-colors duration-300" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@matrix.com"
                  autoComplete="email"
                  {...register("email")}
                  className={`pl-10 pr-4 py-6 bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 transition-all duration-300 rounded-xl placeholder:text-zinc-600 ${
                    errors.email ? "border-rose-500/50 focus:border-rose-500" : ""
                  }`}
                  aria-invalid={errors.email ? "true" : "false"}
                />
              </div>
              {errors.email && (
                <p className="text-xs font-medium text-rose-400 flex items-center gap-1 mt-1 animate-fade-in">
                  <AlertCircle className="h-3 w-3" /> {errors.email.message}
                </p>
              )}
            </div>

            {/* Input Password Block */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-xs font-medium tracking-wide text-zinc-400">
                  Cryptographic Passphrase
                </Label>
                
                {!isSignUp && (
                  <Dialog open={isForgotOpen} onOpenChange={setIsForgotOpen}>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="text-xs font-medium text-cyan-500 hover:text-cyan-400 hover:underline underline-offset-4 focus:outline-none transition-colors"
                      >
                        Bypass Key?
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] bg-zinc-950 border border-zinc-800 text-zinc-100 backdrop-blur-2xl shadow-[0_30px_70px_rgba(0,0,0,0.9)] rounded-2xl">
                      <form onSubmit={handleForgotPassword}>
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-cyan-400 animate-spin-slow" />
                            Initialize Core Reset Sequence
                          </DialogTitle>
                          <DialogDescription className="text-zinc-400 text-sm mt-2">
                            Provide your structural communication matrix email address below to route an encryption bypass vector link.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4 mt-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="forgotEmail" className="text-xs font-medium text-zinc-400">
                              Target Terminal Endpoint Email
                            </Label>
                            <div className="relative">
                              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                              <Input
                                id="forgotEmail"
                                type="email"
                                placeholder="name@matrix.com"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                className="pl-10 py-6 bg-zinc-900 border-zinc-800 text-zinc-100 rounded-xl focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30"
                                required
                              />
                            </div>
                          </div>
                        </div>
                        <DialogFooter className="mt-4">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsForgotOpen(false)}
                            className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-xl"
                          >
                            Abort
                          </Button>
                          <Button
                            type="submit"
                            disabled={isForgotLoading}
                            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl shadow-lg font-medium tracking-wide border-0 px-5"
                          >
                            {isForgotLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Beaming Vector...
                              </>
                            ) : (
                              "Deploy Reset Link"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              <div className="relative group/input">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within/input:text-purple-400 transition-colors duration-300" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  {...register("password")}
                  onChange={(e) => {
                    register("password").onChange(e);
                    setPasswordValue(e.target.value);
                  }}
                  className={`pl-10 pr-10 py-6 bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30 transition-all duration-300 rounded-xl placeholder:text-zinc-600 ${
                    errors.password ? "border-rose-500/50 focus:border-rose-500" : ""
                  }`}
                  aria-invalid={errors.password ? "true" : "false"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  aria-label={showPassword ? "Conceal input passphrase value" : "Display input passphrase value"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs font-medium text-rose-400 flex items-center gap-1 mt-1 animate-fade-in">
                  <AlertCircle className="h-3 w-3" /> {errors.password.message}
                </p>
              )}

              {/* Realtime Password Entropy Array */}
              {isSignUp && (
                <div className="mt-2.5 space-y-1.5 animate-fade-in">
                  <div className="flex justify-between items-center text-[10px] tracking-wider uppercase font-semibold text-zinc-500">
                    <span>Cryptographic Shield Density</span>
                    <span className="text-zinc-400 transition-colors duration-300">{strength.label}</span>
                  </div>
                  <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-zinc-800/40">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ease-out ${strength.color}`}
                      style={{ width: `${strength.score}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Remember Me Cluster UI Block */}
            {!isSignUp && (
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="remember" 
                    className="border-zinc-700 bg-zinc-900/60 text-cyan-500 focus-visible:ring-cyan-500/40 data-[state=checked]:bg-cyan-500 data-[state=checked]:text-black rounded-md"
                  />
                  <label
                    htmlFor="remember"
                    className="text-xs font-medium text-zinc-400 cursor-pointer select-none hover:text-zinc-300 transition-colors"
                  >
                    Preserve session tokens
                  </label>
                </div>
              </div>
            )}

            {/* Core Action Executive Trigger Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className={`w-full py-6 mt-2 relative overflow-hidden group/btn font-semibold tracking-wide border-0 rounded-xl shadow-2xl text-white transition-all duration-300 ${
                isSignUp 
                  ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500" 
                  : "bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500"
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-200" />
                  <span className="animate-pulse tracking-widest text-xs uppercase">Processing Matrix...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
                  <span>{isSignUp ? "Initialize Deployment" : "Establish Secure Uplink"}</span>
                  <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>
          </form>

          {/* Elegant Core Boundary Structural Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-zinc-800/80" />
            </div>
            <div className="relative flex justify-center text-[10px] tracking-[0.2em] font-bold uppercase">
              <span className="bg-[#0b0b0e]/90 px-3 text-zinc-500 mix-blend-plus-lighter">
                Or Continue With
              </span>
            </div>
          </div>

          {/* Complementary Federated Single Sign-On Cluster */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialPlaceholder("Google")}
              className="py-5 bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded-xl transition-all duration-300 group/soc"
            >
              <Chrome className="mr-2 h-4 w-4 text-zinc-400 group-hover/soc:text-rose-400 transition-colors" />
              <span className="text-xs font-medium tracking-wide">Google</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialPlaceholder("GitHub")}
              className="py-5 bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded-xl transition-all duration-300 group/soc"
            >
              <Github className="mr-2 h-4 w-4 text-zinc-400 group-hover/soc:text-white transition-colors" />
              <span className="text-xs font-medium tracking-wide">GitHub</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Structural Cryptographic Workspace Footer */}
      <footer className="w-full text-center relative z-10 mt-8">
        <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-zinc-600 select-none transition-colors duration-500 hover:text-zinc-400">
          Powered by RD Calculator Pro
        </p>
      </footer>
    </div>
  );
}

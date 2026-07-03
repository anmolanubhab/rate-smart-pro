import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function DealerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in as a valid b2b dealer, skip login
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from("portal_users" as never)
        .select("portal_type,status")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const pu = data as { portal_type?: string; status?: string } | null;
      if (pu && pu.portal_type === "b2b" && pu.status === "active") {
        navigate("/dealer/dashboard", { replace: true });
      }
    })();
  }, [navigate]);

  const humanizeAuthError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "Incorrect email or password.";
    if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
    if (m.includes("email not confirmed")) return "Please confirm your email before signing in.";
    return "Unable to sign in. Please try again.";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    try {
      const { data: signIn, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !signIn.user) {
        toast({ title: "Sign in failed", description: humanizeAuthError(error?.message ?? ""), variant: "destructive" });
        return;
      }

      // Verify dealer registration
      const attempt = () =>
        supabase
          .from("portal_users" as never)
          .select("portal_type,status")
          .eq("user_id", signIn.user.id)
          .maybeSingle();
      let { data: puRow, error: puErr } = await attempt();
      if (puErr && (puErr.code === "PGRST202" || /schema cache/i.test(puErr.message ?? ""))) {
        await new Promise((r) => setTimeout(r, 400));
        ({ data: puRow, error: puErr } = await attempt());
      }
      const pu = puRow as { portal_type?: string; status?: string } | null;

      if (puErr || !pu) {
        await supabase.auth.signOut();
        toast({
          title: "Not a dealer account",
          description: "This account is not registered as a dealer. Contact your account manager.",
          variant: "destructive",
        });
        return;
      }
      if (pu.portal_type !== "b2b") {
        await supabase.auth.signOut();
        toast({ title: "Wrong portal", description: "This account does not have B2B dealer access.", variant: "destructive" });
        return;
      }
      if (pu.status !== "active") {
        await supabase.auth.signOut();
        toast({ title: "Account suspended", description: "Your dealer account is suspended. Contact your account manager.", variant: "destructive" });
        return;
      }

      toast({ title: "Welcome back" });
      navigate("/dealer/dashboard", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="h-10 w-10 rounded-md gradient-primary mb-3" />
          <CardTitle>Dealer Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">Access your dealer portal.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="dealer-email">Email</Label>
              <Input
                id="dealer-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dealer-password">Password</Label>
              <Input
                id="dealer-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Forgot password? Contact your account manager.
            </p>
            <p className="text-xs text-center text-muted-foreground">
              New dealer?{" "}
              <Link to={`/dealer/apply${window.location.search}`} className="underline">
                Apply for an account
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

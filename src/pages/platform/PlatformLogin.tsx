import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function PlatformLogin() {
  useEffect(() => { document.title = "RD-Pro Control Center — Sign in"; }, []);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in as an active platform staff member, skip login.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from("platform_staff" as never)
        .select("status")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const ps = data as { status?: string } | null;
      if (ps && ps.status === "active") {
        navigate("/platform", { replace: true });
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

      const attempt = () =>
        supabase
          .from("platform_staff" as never)
          .select("status")
          .eq("user_id", signIn.user.id)
          .maybeSingle();
      let { data: psRow, error: psErr } = await attempt();
      if (psErr && (psErr.code === "PGRST202" || /schema cache/i.test(psErr.message ?? ""))) {
        await new Promise((r) => setTimeout(r, 400));
        ({ data: psRow, error: psErr } = await attempt());
      }
      const ps = psRow as { status?: string } | null;

      if (psErr || !ps) {
        await supabase.auth.signOut();
        toast({
          title: "Not a platform staff account",
          description: "This account does not have RD-Pro Control Center access.",
          variant: "destructive",
        });
        return;
      }
      if (ps.status !== "active") {
        await supabase.auth.signOut();
        toast({ title: "Access suspended", description: "Your platform staff access is suspended.", variant: "destructive" });
        return;
      }

      toast({ title: "Welcome back" });
      navigate("/platform", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="h-10 w-10 rounded-md gradient-primary mb-3" />
          <CardTitle>RD-Pro Control Center</CardTitle>
          <p className="text-sm text-muted-foreground">Internal platform staff sign in.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="platform-email">Email</Label>
              <Input
                id="platform-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@rdpro.app"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform-password">Password</Label>
              <Input
                id="platform-password"
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

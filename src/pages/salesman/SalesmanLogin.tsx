import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function SalesmanLogin() {
  useEffect(() => { document.title = "Salesman Portal — Sign in"; }, []);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in as an active salesman, skip login
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from("portal_users" as never)
        .select("role,status")
        .eq("user_id", session.user.id)
        .eq("role", "salesman")
        .maybeSingle();
      const su = data as { role?: string; status?: string } | null;
      if (su && su.status === "active") {
        navigate("/salesman/dashboard", { replace: true });
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
          .from("portal_users" as never)
          .select("role,status")
          .eq("user_id", signIn.user.id)
          .eq("role", "salesman")
          .maybeSingle();
      let { data: suRow, error: suErr } = await attempt();
      if (suErr && (suErr.code === "PGRST202" || /schema cache/i.test(suErr.message ?? ""))) {
        await new Promise((r) => setTimeout(r, 400));
        ({ data: suRow, error: suErr } = await attempt());
      }
      const su = suRow as { role?: string; status?: string } | null;

      if (suErr || !su) {
        await supabase.auth.signOut();
        toast({
          title: "Not a salesman portal account",
          description: "This account does not have Salesman Portal access. Contact your admin.",
          variant: "destructive",
        });
        return;
      }
      if (su.status !== "active") {
        await supabase.auth.signOut();
        toast({ title: "Access suspended", description: "Your portal access is suspended. Contact your admin.", variant: "destructive" });
        return;
      }

      toast({ title: "Welcome back" });
      navigate("/salesman/dashboard", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="h-10 w-10 rounded-md gradient-primary mb-3" />
          <CardTitle>Salesman Portal</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to manage your parties, orders and sales.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="salesman-email">Email</Label>
              <Input
                id="salesman-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salesman-password">Password</Label>
              <Input
                id="salesman-password"
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
              Forgot password, or don't have access yet? Contact your admin.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

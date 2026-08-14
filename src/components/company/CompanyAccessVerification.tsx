import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { verifyCurrentPassword } from "@/lib/companySafety";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, ShieldCheck, XCircle, Smartphone, ChevronDown } from "lucide-react";
import QrCodeImage from "@/components/print/QrCodeImage";
import { COMPANY_ACCESS_VERIFICATION_MODE } from "@/lib/companyAccessConfig";

type Session = {
  id: string;
  token: string;
  correct_number: number;
  expires_at: string;
};

type Step = "password" | "creating" | "challenge" | "verified" | "expired" | "cancelled" | "no_access";

/**
 * Google/Microsoft-style number-matching gate shown before a company opens.
 * Step order: password re-entry -> server-side membership check + challenge
 * creation -> desktop shows one number, mobile (reached via QR/token link)
 * must pick the matching number out of three. The desktop never trusts a
 * client-set "verified" flag -- it only reacts to the session row's status
 * column, which is exclusively mutated by a SECURITY DEFINER RPC on the
 * backend and observed here via Realtime + a polling fallback.
 */
export default function CompanyAccessVerification({
  businessId,
  businessName,
  open,
  onCancel,
  onVerified,
}: {
  businessId: string;
  businessName: string;
  open: boolean;
  onCancel: () => void;
  onVerified: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [remaining, setRemaining] = useState(60);
  const [showMobile, setShowMobile] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("password");
    setPassword("");
    setPasswordError(null);
    setSession(null);
    setShowMobile(false);
  }, [open]);

  const startChallenge = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_company_verification_session", {
        _business_id: businessId,
      } as any);
      if (error) {
        if (error.message?.includes("no_access")) {
          setStep("no_access");
        } else {
          setPasswordError(error.message ?? "Could not start verification.");
          setStep("password");
        }
        return;
      }
      const row = data as any;
      const s: Session = { id: row.id, token: row.token, correct_number: row.correct_number, expires_at: row.expires_at };
      sessionIdRef.current = s.id;
      setSession(s);
      setStep("challenge");
    } finally {
      setBusy(false);
    }
  };

  // password_only mode: skip the number-matching challenge and rely on the
  // same server-side membership check the challenge RPC uses internally.
  const checkAccessOnly = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("is_business_member", {
        _business_id: businessId,
      } as any);
      if (error || !data) {
        setStep("no_access");
        return;
      }
      setStep("verified");
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password) return;
    setBusy(true);
    setPasswordError(null);
    try {
      const err = await verifyCurrentPassword(password);
      if (err) {
        setPasswordError(err);
        setBusy(false);
        return;
      }
      setStep("creating");
      if (COMPANY_ACCESS_VERIFICATION_MODE === "number_matching") {
        await startChallenge();
      } else {
        await checkAccessOnly();
      }
    } finally {
      setBusy(false);
    }
  };

  // Countdown + status watch (realtime + fallback poll) while a challenge is live.
  useEffect(() => {
    if (step !== "challenge" || !session) return;

    const tick = () => {
      const secs = Math.max(0, Math.round((new Date(session.expires_at).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0) setStep((cur) => (cur === "challenge" ? "expired" : cur));
    };
    tick();
    const countdownTimer = setInterval(tick, 1000);

    const applyStatus = (status: string) => {
      if (status === "verified") setStep("verified");
      else if (status === "expired") setStep((cur) => (cur === "challenge" ? "expired" : cur));
      else if (status === "cancelled") setStep((cur) => (cur === "challenge" ? "cancelled" : cur));
    };

    const channel = supabase
      .channel(`cavs-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "company_access_verification_sessions", filter: `id=eq.${session.id}` },
        (payload) => applyStatus((payload.new as any).status),
      )
      .subscribe();

    const pollTimer = setInterval(async () => {
      const { data } = await supabase
        .from("company_access_verification_sessions")
        .select("status")
        .eq("id", session.id)
        .single();
      if (data) applyStatus((data as any).status);
    }, 3000);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [step, session]);

  useEffect(() => {
    if (step === "verified") {
      const t = setTimeout(onVerified, 700);
      return () => clearTimeout(t);
    }
  }, [step, onVerified]);

  const handleCancel = async () => {
    const id = sessionIdRef.current;
    if (id) {
      supabase.rpc("cancel_verification_session", { _session_id: id } as any).then(() => {});
    }
    onCancel();
  };

  const handleTryAgain = async () => {
    setStep("creating");
    await startChallenge();
  };

  const mobileUrl = session ? `${window.location.origin}/verify-company/${session.token}` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-sm">
        {(step === "password" || step === "creating") && (
          <>
            <DialogHeader>
              <DialogTitle>Verify Company Access</DialogTitle>
              <DialogDescription>Confirm your password to continue opening this company.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Company</Label>
                <Input value={businessName} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label>Username</Label>
                <Input value={user?.email ?? ""} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cav-password">Password</Label>
                <div className="relative">
                  <Input
                    id="cav-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel} disabled={busy}>Cancel</Button>
              <Button onClick={handlePasswordSubmit} disabled={busy || !password}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                OK
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "no_access" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" />Access denied</DialogTitle>
              <DialogDescription>You don't have access to this company. Please contact your administrator.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleCancel}>Close</Button>
            </DialogFooter>
          </>
        )}

        {step === "challenge" && session && (
          <>
            <DialogHeader>
              <DialogTitle>Verify Company Access</DialogTitle>
              <DialogDescription>Someone is trying to open <span className="font-medium text-foreground">{businessName}</span>. Approve on your other device.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Select this number on your phone</p>
                <div className="text-5xl font-bold tracking-widest tabular-nums">{session.correct_number}</div>
              </div>
              <p className="text-sm text-muted-foreground">Expires in {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</p>

              <button
                type="button"
                onClick={() => setShowMobile((v) => !v)}
                className="mx-auto flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Smartphone className="h-4 w-4" /> Verify on Mobile
                <ChevronDown className={`h-3 w-3 transition-transform ${showMobile ? "rotate-180" : ""}`} />
              </button>
              {showMobile && (
                <div className="flex flex-col items-center gap-2 pt-1">
                  <QrCodeImage value={mobileUrl} sizePx={140} />
                  <p className="text-xs text-muted-foreground break-all max-w-xs">{mobileUrl}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {step === "verified" && (
          <div className="py-6 text-center space-y-2">
            <ShieldCheck className="h-10 w-10 mx-auto text-green-600" />
            <p className="font-medium">Verification successful</p>
            <p className="text-sm text-muted-foreground">Opening {businessName}…</p>
          </div>
        )}

        {step === "expired" && (
          <>
            <DialogHeader>
              <DialogTitle>Verification expired</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleTryAgain}>Try Again</Button>
            </DialogFooter>
          </>
        )}

        {step === "cancelled" && (
          <>
            <DialogHeader>
              <DialogTitle>Verification cancelled</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleCancel}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

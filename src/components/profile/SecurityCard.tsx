import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { Shield, Key, Lock, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  user: User | null;
}

const SecurityCard = ({ user }: Props) => {
  const { signOut } = useAuth();

  // ── Change Password ──
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const changePassword = async () => {
    if (!user?.email) return;
    if (newPw.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPw !== confirmPw) { toast.error("New password and confirmation don't match"); return; }
    setPwSaving(true);
    try {
      // Verify the current password by re-authenticating, so a stolen
      // active session alone can't be used to lock the real owner out.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: currentPw,
      });
      if (verifyErr) throw new Error("Current password is incorrect");

      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;

      toast.success("Password updated");
      setPwOpen(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not change password");
    } finally {
      setPwSaving(false);
    }
  };

  // ── Two-Factor Authentication (TOTP) ──
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const refreshMfaStatus = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    setMfaEnabled(!!verified);
    setFactorId(verified?.id ?? null);
  };

  useEffect(() => { refreshMfaStatus(); }, []);

  const startEnroll = async () => {
    setMfaBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
      setMfaOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not start 2FA setup");
    } finally {
      setMfaBusy(false);
    }
  };

  const verifyEnroll = async () => {
    if (!factorId || code.length < 6) { toast.error("Enter the 6-digit code from your authenticator app"); return; }
    setMfaBusy(true);
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code,
      });
      if (verErr) throw verErr;

      toast.success("Two-factor authentication enabled");
      setMfaOpen(false);
      setQrSvg(null); setSecret(null); setCode("");
      await refreshMfaStatus();
    } catch (e: any) {
      toast.error(e.message ?? "Invalid code — try again");
    } finally {
      setMfaBusy(false);
    }
  };

  const disable2FA = async () => {
    if (!factorId) return;
    if (!confirm("Disable two-factor authentication? Your account will only be protected by your password.")) return;
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Two-factor authentication disabled");
      await refreshMfaStatus();
    } catch (e: any) {
      toast.error(e.message ?? "Could not disable 2FA");
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Shield className="h-4 w-4" /> Security
      </div>

      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setPwOpen(true)}>
          <Key className="h-4 w-4" /> Change Password
        </Button>

        {mfaEnabled ? (
          <Button variant="outline" className="w-full justify-start gap-2 text-emerald-600" onClick={disable2FA} disabled={mfaBusy}>
            <ShieldCheck className="h-4 w-4" /> Two-Factor Authentication (Enabled — click to disable)
          </Button>
        ) : (
          <Button variant="outline" className="w-full justify-start gap-2" onClick={startEnroll} disabled={mfaBusy}>
            <Lock className="h-4 w-4" /> Two-Factor Authentication
          </Button>
        )}

        <Button
          variant="destructive"
          className="w-full justify-start gap-2"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </div>

      {user?.last_sign_in_at && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Last login: {new Date(user.last_sign_in_at).toLocaleString()}
        </p>
      )}

      {/* Change Password */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)} disabled={pwSaving}>Cancel</Button>
            <Button onClick={changePassword} disabled={pwSaving}>{pwSaving ? "Updating…" : "Update Password"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA Enrollment */}
      <Dialog open={mfaOpen} onOpenChange={(o) => { setMfaOpen(o); if (!o) { setCode(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Up Two-Factor Authentication</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code it shows.
            </p>
            {qrSvg && (
              <div className="flex justify-center bg-white p-3 rounded-lg border" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
            {secret && (
              <p className="text-xs text-center text-muted-foreground">
                Can't scan? Enter this key manually: <span className="font-mono">{secret}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label>6-digit code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="123456" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMfaOpen(false)} disabled={mfaBusy}>Cancel</Button>
            <Button onClick={verifyEnroll} disabled={mfaBusy}>{mfaBusy ? "Verifying…" : "Verify & Enable"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SecurityCard;

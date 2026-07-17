import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Building2, ShieldCheck, Eye, EyeOff, XCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getInvitationByToken, acceptInvitation, rejectInvitation,
  type InvitationStatus,
} from "@/lib/userAccess";
import { setActiveBusinessId } from "@/hooks/useBusiness";
import { logAudit } from "@/lib/audit";

const passwordRules = [
  { label: "8 characters", test: (v: string) => v.length >= 8 },
  { label: "1 uppercase", test: (v: string) => /[A-Z]/.test(v) },
  { label: "1 lowercase", test: (v: string) => /[a-z]/.test(v) },
  { label: "1 number", test: (v: string) => /\d/.test(v) },
  { label: "1 special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];
const isStrongPassword = (v: string) => passwordRules.every((r) => r.test(v));

type InviteInfo = {
  status: InvitationStatus;
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
  business_name: string;
  expires_at: string;
};

export default function AcceptInvite() {
  useEffect(() => { document.title = "Accept Invitation — RD Pro"; }, []);
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      try {
        const data = await getInvitationByToken(token);
        if (!data.found) { setNotFound(true); return; }
        setInvite(data as InviteInfo);
      } catch (e: any) {
        toast.error(e.message ?? "Could not load invitation");
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const finishAccept = async () => {
    setSubmitting(true);
    try {
      const result = await acceptInvitation(token);
      setActiveBusinessId(result.business_id);
      await logAudit({ business_id: result.business_id, action: "USER_INVITE_ACCEPTED", entity_type: "business_user_invitation" });
      toast.success(result.already_member ? "You're already part of this company" : "Welcome aboard!");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error(e.message ?? "Could not accept invitation");
    } finally {
      setSubmitting(false);
    }
  };

  // Existing, already-signed-in user whose session email matches the invite:
  // just show a "Join business" confirmation, no password form.
  const handleJoinExisting = () => finishAccept();

  const handleCreateAccount = async () => {
    if (!invite) return;
    if (!isStrongPassword(password)) { toast.error("Password does not meet the requirements"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    if (!agree) { toast.error("Please accept the terms to continue"); return; }

    setSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
      });
      if (signUpError) throw signUpError;

      // If email confirmation is required by project settings, there may be
      // no session yet — in that case we can't call accept_invitation (it
      // needs auth.uid()). Handle both cases.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.success("Account created — check your email to confirm, then reopen this link to finish joining.");
        return;
      }
      await finishAccept();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create account");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!confirm) { /* no-op */ }
    try {
      await rejectInvitation(token);
      toast.success("Invitation declined");
      navigate("/auth");
    } catch (e: any) {
      toast.error(e.message ?? "Could not decline invitation");
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[460px]">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <img src="/icons/icon-128x128.png" alt="RD Pro" className="w-16 h-16 rounded-2xl shadow-lg" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome To RD-PRO</h1>
          <p className="text-sm text-slate-500 mt-1">Company Invitation</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8">{children}</div>
      </div>
    </div>
  );

  if (loading || authLoading) {
    return <Shell><div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div></Shell>;
  }

  if (notFound) {
    return (
      <Shell>
        <div className="text-center py-4">
          <XCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Invitation not found</h2>
          <p className="text-sm text-slate-500 mt-1">This link is invalid. Please ask the company owner to send a new one.</p>
          <Button className="mt-5" variant="outline" onClick={() => navigate("/auth")}>Go to sign in</Button>
        </div>
      </Shell>
    );
  }

  if (!invite) return null;

  if (invite.status === "expired") {
    return (
      <Shell>
        <div className="text-center py-4">
          <XCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Invitation expired</h2>
          <p className="text-sm text-slate-500 mt-1">Ask the owner of <span className="font-medium">{invite.business_name}</span> to resend your invitation.</p>
        </div>
      </Shell>
    );
  }
  if (invite.status === "revoked" || invite.status === "rejected") {
    return (
      <Shell>
        <div className="text-center py-4">
          <XCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Invitation no longer active</h2>
          <p className="text-sm text-slate-500 mt-1">This invitation was {invite.status}. Contact the company owner if this is unexpected.</p>
        </div>
      </Shell>
    );
  }
  if (invite.status === "accepted") {
    return (
      <Shell>
        <div className="text-center py-4">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Already accepted</h2>
          <p className="text-sm text-slate-500 mt-1">This invitation has already been used. Please sign in normally.</p>
          <Button className="mt-5" onClick={() => navigate("/auth")}>Go to sign in</Button>
        </div>
      </Shell>
    );
  }

  const isMatchingSession = !!user && user.email?.toLowerCase() === invite.email.toLowerCase();

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
        <Building2 className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="text-sm">
          <span className="font-semibold text-slate-900">{invite.business_name}</span>
          <span className="text-slate-500"> invited you as </span>
          <span className="font-medium capitalize text-slate-900">{invite.role}</span>
          {invite.department && <span className="text-slate-500"> · {invite.department}</span>}
        </div>
      </div>

      {isMatchingSession ? (
        // Already signed in with the matching email — multi-business join, no password needed.
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You're signed in as <span className="font-medium">{user.email}</span>. Join this company now?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleReject} disabled={submitting}>Decline</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleJoinExisting} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join company"}
            </Button>
          </div>
        </div>
      ) : user ? (
        <div className="text-sm text-slate-600 space-y-3">
          <p>
            You're currently signed in as <span className="font-medium">{user.email}</span>, but this invitation
            was sent to <span className="font-medium">{invite.email}</span>.
          </p>
          <p>Please sign out and open this link again using the invited email address.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Email</Label>
            <Input value={invite.email} disabled className="bg-slate-50" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Create Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                onClick={() => setShowPw((s) => !s)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1">
              {passwordRules.map((r) => (
                <li key={r.label} className={`text-xs flex items-center gap-1 ${r.test(password) ? "text-green-600" : "text-slate-400"}`}>
                  <ShieldCheck className="h-3 w-3" /> {r.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Confirm Password</Label>
            <Input type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} id="accept-terms" />
            <Label htmlFor="accept-terms" className="text-xs text-slate-500 font-normal leading-snug">
              I accept the Terms of Service and Privacy Policy.
            </Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleReject} disabled={submitting}>Decline</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleCreateAccount} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

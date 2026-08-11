import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff, XCircle, CheckCircle2 } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getInvitationByToken, acceptInvite } from "@/lib/platformStaff";

const passwordRules = [
  { label: "8 characters", test: (v: string) => v.length >= 8 },
  { label: "1 uppercase", test: (v: string) => /[A-Z]/.test(v) },
  { label: "1 lowercase", test: (v: string) => /[a-z]/.test(v) },
  { label: "1 number", test: (v: string) => /\d/.test(v) },
  { label: "1 special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];
const isStrongPassword = (v: string) => passwordRules.every((r) => r.test(v));

type InviteInfo = {
  status: string;
  email: string;
  full_name: string | null;
  role_name: string | null;
  department_name: string | null;
  expires_at: string;
};

export default function PlatformAcceptInvite() {
  useEffect(() => { document.title = "Accept Invitation — RD-Pro Control Center"; }, []);
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
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not load invitation");
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const finishAccept = async () => {
    setSubmitting(true);
    try {
      await acceptInvite(token);
      toast.success("Welcome to RD-Pro Control Center!");
      navigate("/platform");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not accept invitation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinExisting = () => finishAccept();

  const handleCreateAccount = async () => {
    if (!invite) return;
    if (!isStrongPassword(password)) { toast.error("Password does not meet the requirements"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    if (!agree) { toast.error("Please accept the terms to continue"); return; }

    setSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({ email: invite.email, password });
      if (signUpError) throw signUpError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.success("Account created — check your email to confirm, then reopen this link to finish joining.");
        return;
      }
      await finishAccept();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[460px]">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 h-16 w-16 rounded-2xl shadow-lg gradient-primary flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RD-Pro Control Center</h1>
          <p className="text-sm text-slate-500 mt-1">Platform Staff Invitation</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8">{children}</div>
      </div>
    </div>
  );

  if (loading || authLoading) {
    return <Shell><div className="flex items-center justify-center py-10"><LoadingSpinner size="md" /></div></Shell>;
  }

  if (notFound) {
    return (
      <Shell>
        <div className="text-center py-4">
          <XCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Invitation not found</h2>
          <p className="text-sm text-slate-500 mt-1">This link is invalid. Please ask a Super Admin to send a new one.</p>
          <Button className="mt-5" variant="outline" onClick={() => navigate("/platform/login")}>Go to sign in</Button>
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
          <p className="text-sm text-slate-500 mt-1">Ask a Super Admin to resend your invitation.</p>
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
          <p className="text-sm text-slate-500 mt-1">This invitation was {invite.status}. Contact your admin if this is unexpected.</p>
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
          <Button className="mt-5" onClick={() => navigate("/platform/login")}>Go to sign in</Button>
        </div>
      </Shell>
    );
  }

  const isMatchingSession = !!user && user.email?.toLowerCase() === invite.email.toLowerCase();

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
        <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="text-sm">
          <span className="font-semibold text-slate-900">RD-Pro</span>
          <span className="text-slate-500"> invited you as </span>
          <span className="font-medium text-slate-900">{invite.role_name ?? "platform staff"}</span>
          {invite.department_name && <span className="text-slate-500"> ({invite.department_name})</span>}
        </div>
      </div>

      {isMatchingSession ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You're signed in as <span className="font-medium">{user.email}</span>. Activate your platform staff access now?
          </p>
          <Button className="w-full" onClick={handleJoinExisting} disabled={submitting}>
            {submitting ? <LoadingSpinner size="sm" /> : "Activate access"}
          </Button>
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
          <Button className="w-full" onClick={handleCreateAccount} disabled={submitting}>
            {submitting ? <LoadingSpinner size="sm" /> : "Create Account"}
          </Button>
        </div>
      )}
    </Shell>
  );
}

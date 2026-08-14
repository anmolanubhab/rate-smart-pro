import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

type Challenge = {
  business_name: string;
  challenge_numbers: number[];
  status: "pending" | "verified" | "expired" | "cancelled";
  expires_at: string;
};

/**
 * Public, token-only mobile verification page. No RD-Pro login is required
 * here -- possession of the token (from scanning the desktop's QR code) is
 * the proof of physical access to the device that started the challenge.
 * The correct number is never sent to this page; every tap is validated
 * server-side by verify_company_number.
 */
export default function VerifyCompanyAccess() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { document.title = "Verify Company Access — RD Pro"; }, []);

  const load = async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("get_verification_challenge_by_token", { _token: token } as any);
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Challenge;
    setChallenge(row);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    if (!challenge || challenge.status !== "pending") return;
    const tick = () => setRemaining(Math.max(0, Math.round((new Date(challenge.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [challenge]);

  const select = async (n: number) => {
    if (!token || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc("verify_company_number", { _token: token, _selected_number: n } as any);
      if (error) {
        setResult("error");
        setMessage(error.message ?? "Something went wrong.");
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as { success: boolean; message: string };
      if (row.success) {
        setResult("success");
      } else {
        setMessage(row.message);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-5">
        <p className="text-sm text-muted-foreground font-medium">RD-Pro</p>
        <h1 className="text-xl font-semibold">Verify Company Access</h1>

        {loading && (
          <div className="py-10"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
        )}

        {!loading && notFound && (
          <div className="space-y-2 py-6">
            <ShieldX className="h-10 w-10 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">This verification link is invalid.</p>
          </div>
        )}

        {!loading && challenge && result === "success" && (
          <div className="space-y-2 py-6">
            <ShieldCheck className="h-10 w-10 mx-auto text-green-600" />
            <p className="font-medium">Verification successful</p>
            <p className="text-sm text-muted-foreground">You can return to your computer.</p>
          </div>
        )}

        {!loading && challenge && result !== "success" && challenge.status === "verified" && (
          <div className="space-y-2 py-6">
            <ShieldCheck className="h-10 w-10 mx-auto text-green-600" />
            <p className="text-sm text-muted-foreground">This request has already been approved.</p>
          </div>
        )}

        {!loading && challenge && result !== "success" && (challenge.status === "expired" || (challenge.status === "pending" && remaining === 0)) && (
          <div className="space-y-2 py-6">
            <ShieldAlert className="h-10 w-10 mx-auto text-amber-600" />
            <p className="text-sm text-muted-foreground">This verification request has expired.</p>
          </div>
        )}

        {!loading && challenge && result !== "success" && challenge.status === "cancelled" && (
          <div className="space-y-2 py-6">
            <ShieldX className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Verification cancelled.</p>
          </div>
        )}

        {!loading && challenge && result !== "success" && challenge.status === "pending" && remaining > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Someone is trying to open:<br />
              <span className="font-semibold text-foreground">{challenge.business_name}</span>
            </p>
            <p className="text-sm text-muted-foreground">Select the number shown on your computer.</p>
            <div className="flex flex-col gap-3">
              {challenge.challenge_numbers.map((n, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="lg"
                  className="text-2xl font-bold tabular-nums h-14"
                  disabled={submitting}
                  onClick={() => select(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <p className="text-xs text-muted-foreground">
              Expires in {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

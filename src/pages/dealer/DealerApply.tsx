import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2 } from "lucide-react";

type Form = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  password: string;
  gstin: string;
  address: string;
  city: string;
};

const empty: Form = {
  companyName: "", contactName: "", phone: "", email: "", password: "",
  gstin: "", address: "", city: "",
};

export default function DealerApply() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const businessId = params.get("business");

  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    document.title = "Apply for Dealer Account — RD-Pro";
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) {
      toast({
        title: "Invalid application link",
        description: "This link is missing a business reference. Please use the link shared by your distributor.",
        variant: "destructive",
      });
      return;
    }
    if (!form.companyName || !form.contactName || !form.phone || !form.email || !form.password) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      // 1) Create the auth account for this applicant
      const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
      });
      if (signUpErr) {
        const m = signUpErr.message.toLowerCase();
        if (m.includes("already registered") || m.includes("already exists")) {
          toast({
            title: "Account already exists",
            description: "An account with this email already exists. Try signing in instead, or contact your account manager.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Could not create account", description: signUpErr.message, variant: "destructive" });
        }
        return;
      }
      const userId = signUp.user?.id;
      if (!userId) {
        toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
        return;
      }

      // 2) Submit the dealer application referencing that account
      const { error: appErr } = await supabase.from("dealer_applications" as never).insert({
        user_id: userId,
        business_id: businessId,
        company_name: form.companyName,
        contact_name: form.contactName,
        phone: form.phone,
        email: form.email.trim(),
        gstin: form.gstin || null,
        address: form.address || null,
        city: form.city || null,
        portal_type: "b2b",
      } as never);

      if (appErr) {
        toast({ title: "Could not submit application", description: appErr.message, variant: "destructive" });
        return;
      }

      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-sm shadow-lg text-center">
          <CardContent className="pt-8 pb-6 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-semibold">Application submitted</h2>
            <p className="text-sm text-muted-foreground">
              Your distributor will review your details and approve your account.
              You'll be able to sign in once approved.
            </p>
            {form.email && (
              <p className="text-xs text-muted-foreground">
                If email confirmation is required, please check your inbox at{" "}
                <span className="font-medium">{form.email}</span> too.
              </p>
            )}
            <Button className="w-full mt-2" onClick={() => navigate("/dealer/login")}>
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <div className="h-10 w-10 rounded-md gradient-primary mb-3" />
          <CardTitle>Apply for a dealer account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill in your business details. Your distributor will review and approve.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="companyName">Company / Firm name *</Label>
                <Input id="companyName" value={form.companyName} onChange={set("companyName")} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Contact person *</Label>
                <Input id="contactName" value={form.contactName} onChange={set("contactName")} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} required />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} required />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="password">Set a password *</Label>
                <Input id="password" type="password" value={form.password} onChange={set("password")} required minLength={6} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstin">GSTIN</Label>
                <Input id="gstin" value={form.gstin} onChange={set("gstin")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={set("address")} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Submitting…" : "Submit application"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already approved?{" "}
              <Link to="/dealer/login" className="underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

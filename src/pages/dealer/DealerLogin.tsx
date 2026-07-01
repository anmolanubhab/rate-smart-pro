// MOCK DATA - to be wired to Supabase in Phase X
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export default function DealerLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="h-10 w-10 rounded-md gradient-primary mb-3" />
          <CardTitle>Dealer Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">Access your dealer portal.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Dealer Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DLR-XXXXX" />
          </div>
          <div className="space-y-1.5">
            <Label>PIN / Password</Label>
            <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••" />
          </div>
          <Button
            className="w-full"
            onClick={() => {
              // MOCK - to be wired in Phase X
              toast({ title: "Signed in (mock)", description: "Real dealer auth wires in next phase." });
              navigate("/dealer/dashboard");
            }}
          >Sign in</Button>
          <p className="text-xs text-center text-muted-foreground">Forgot PIN? Contact your account manager.</p>
        </CardContent>
      </Card>
    </div>
  );
}

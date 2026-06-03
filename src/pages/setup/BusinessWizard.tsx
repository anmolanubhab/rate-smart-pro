import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
45 lines hidden
  logo_url: "",
};
 
const errorMessage = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Failed to save";
};
 
export default function BusinessWizard() {
  const { user } = useAuth();
  const { business, refetch } = useBusiness();
24 lines hidden
        const { error } = await supabase.from("businesses")
          .update({ ...form, setup_completed: complete || business.setup_completed })
          .eq("id", business.id);
        if (error) throw error;
        if (error) throw new Error(`UPDATE businesses failed: ${error.message}`);
        await logAudit({ business_id: business.id, action: "BUSINESS_UPDATE", entity_type: "business", entity_id: business.id, new_value: form });
      } else {
        const { data: created, error } = await supabase.from("businesses")
          .insert({ ...form, owner_id: user.id, setup_completed: complete })
          .select("id").single();
        if (error) throw error;
        const businessId = crypto.randomUUID();
        const { error } = await supabase.from("businesses").insert({
          id: businessId,
          ...form,
          owner_id: user.id,
          setup_completed: complete,
        });
        if (error) throw new Error(`INSERT businesses failed: ${error.message}`);
 
        const { error: mErr } = await supabase.from("business_members").insert({
          business_id: created.id, user_id: user.id, role: "owner", status: "active",
          business_id: businessId,
          user_id: user.id,
          role: "owner",
          status: "active",
        });
        if (mErr) throw mErr;
        await logAudit({ business_id: created.id, action: "BUSINESS_CREATE", entity_type: "business", entity_id: created.id, new_value: form });
        if (mErr) {
          await supabase.from("businesses").delete().eq("id", businessId);
          throw new Error(`INSERT business_members failed: ${mErr.message}`);
        }
 
        await logAudit({ business_id: businessId, action: "BUSINESS_CREATE", entity_type: "business", entity_id: businessId, new_value: form });
      }
      await qc.invalidateQueries({ queryKey: ["current-business"] });
      await refetch();
      toast.success(complete ? "Setup completed" : "Progress saved");
      if (complete) nav("/dashboard");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
      console.error(e);
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
120 lines hidden
    <Switch checked={value} onCheckedChange={onChange} />
  </div>
);

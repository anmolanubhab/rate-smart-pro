import { supabase } from "@/integrations/supabase/client";

export interface Transporter {
  id: string;
  business_id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
}

export async function fetchTransporters(businessId: string): Promise<Transporter[]> {
  const { data, error } = await supabase
    .from("transporters" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as unknown as Transporter[]) ?? [];
}

export async function createTransporter(input: {
  businessId: string;
  userId: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}): Promise<Transporter> {
  const { data, error } = await supabase
    .from("transporters" as never)
    .insert({
      business_id: input.businessId,
      name: input.name.trim(),
      gstin: input.gstin || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      created_by: input.userId,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Transporter;
}

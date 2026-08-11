import { supabase } from "@/integrations/supabase/client";

export interface PlatformRoleRow {
  id: string;
  name: string;
  description: string | null;
  level: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformPermissionRow {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
}

// platform_* tables are not in the generated Supabase types yet; cast to keep TS happy.
const tbl = (name: string) => (supabase as unknown as { from: (n: string) => any }).from(name);

export async function listRoles(): Promise<PlatformRoleRow[]> {
  const { data, error } = await tbl("platform_roles").select("*").order("level", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlatformRoleRow[];
}

export async function listPermissionCatalog(): Promise<PlatformPermissionRow[]> {
  const { data, error } = await tbl("platform_permissions").select("*").order("resource").order("action");
  if (error) throw error;
  return (data ?? []) as PlatformPermissionRow[];
}

export async function listRolePermissionIds(roleId: string): Promise<string[]> {
  const { data, error } = await tbl("platform_role_permissions").select("permission_id").eq("role_id", roleId);
  if (error) throw error;
  return (data ?? []).map((r: { permission_id: string }) => r.permission_id);
}

export async function listStaffForRole(roleId: string) {
  const { data, error } = await tbl("platform_staff_roles")
    .select("staff_id, platform_staff(id,full_name,email,status)")
    .eq("role_id", roleId);
  if (error) throw error;
  return ((data ?? []) as unknown as { platform_staff: { id: string; full_name: string | null; email: string | null; status: string } }[])
    .map((r) => r.platform_staff);
}

export async function createRole(input: { name: string; description?: string; level: number }): Promise<PlatformRoleRow> {
  const { data, error } = await tbl("platform_roles")
    .insert({ name: input.name, description: input.description ?? null, level: input.level })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlatformRoleRow;
}

export async function updateRole(id: string, patch: Partial<Pick<PlatformRoleRow, "name" | "description" | "level">>): Promise<void> {
  const { error } = await tbl("platform_roles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await tbl("platform_roles").delete().eq("id", id);
  if (error) throw error;
}

export async function assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
  const { error } = await tbl("platform_role_permissions").insert({ role_id: roleId, permission_id: permissionId });
  if (error) throw error;
}

export async function removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
  const { error } = await tbl("platform_role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
  if (error) throw error;
}

/**
 * Create a new role with the same description/level and permission set as
 * an existing one. Each permission is still attached via the normal
 * delegation-checked INSERT path (assignPermissionToRole), so duplicating a
 * role you can't actually delegate every permission of will partially fail
 * rather than silently granting more than the caller is authorized for.
 */
export async function duplicateRole(sourceRoleId: string, newName: string): Promise<PlatformRoleRow> {
  const [roles, permissionIds] = await Promise.all([listRoles(), listRolePermissionIds(sourceRoleId)]);
  const source = roles.find((r) => r.id === sourceRoleId);
  if (!source) throw new Error("Source role not found");

  const created = await createRole({ name: newName, description: source.description ?? undefined, level: source.level });
  for (const permissionId of permissionIds) {
    await assignPermissionToRole(created.id, permissionId);
  }
  return created;
}

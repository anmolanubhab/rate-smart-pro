import { supabase } from "@/integrations/supabase/client";
import { listStaff, type PlatformStaffRow } from "@/lib/platformStaff";

export interface PlatformDepartmentRow {
  id: string;
  name: string;
  description: string | null;
}

export interface PlatformTeamRow {
  id: string;
  name: string;
  department_id: string | null;
  description: string | null;
}

// platform_* tables are not in the generated Supabase types yet; cast to keep TS happy.
const tbl = (name: string) => (supabase as unknown as { from: (n: string) => any }).from(name);

export async function listDepartments(): Promise<PlatformDepartmentRow[]> {
  const { data, error } = await tbl("platform_departments").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as PlatformDepartmentRow[];
}

export async function createDepartment(input: { name: string; description?: string }): Promise<PlatformDepartmentRow> {
  const { data, error } = await tbl("platform_departments").insert({ name: input.name, description: input.description ?? null }).select("*").single();
  if (error) throw error;
  return data as PlatformDepartmentRow;
}

export async function updateDepartment(id: string, patch: Partial<Pick<PlatformDepartmentRow, "name" | "description">>): Promise<void> {
  const { error } = await tbl("platform_departments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await tbl("platform_departments").delete().eq("id", id);
  if (error) throw error;
}

export async function listTeams(departmentId?: string): Promise<PlatformTeamRow[]> {
  let q = tbl("platform_teams").select("*");
  if (departmentId) q = q.eq("department_id", departmentId);
  q = q.order("name");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PlatformTeamRow[];
}

export async function createTeam(input: { name: string; department_id?: string | null; description?: string }): Promise<PlatformTeamRow> {
  const { data, error } = await tbl("platform_teams")
    .insert({ name: input.name, department_id: input.department_id ?? null, description: input.description ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlatformTeamRow;
}

export async function updateTeam(id: string, patch: Partial<Pick<PlatformTeamRow, "name" | "department_id" | "description">>): Promise<void> {
  const { error } = await tbl("platform_teams").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await tbl("platform_teams").delete().eq("id", id);
  if (error) throw error;
}

export async function addStaffToTeam(staffId: string, teamId: string): Promise<void> {
  const { error } = await tbl("platform_staff_teams").insert({ staff_id: staffId, team_id: teamId });
  if (error) throw error;
}

export async function removeStaffFromTeam(staffId: string, teamId: string): Promise<void> {
  const { error } = await tbl("platform_staff_teams").delete().eq("staff_id", staffId).eq("team_id", teamId);
  if (error) throw error;
}

export interface OrgTreeTeam extends PlatformTeamRow {
  staff: PlatformStaffRow[];
}

export interface OrgTreeDepartment extends PlatformDepartmentRow {
  teams: OrgTreeTeam[];
  staff: PlatformStaffRow[]; // department members not on any team
}

export interface OrgTree {
  departments: OrgTreeDepartment[];
  unassigned: PlatformStaffRow[]; // staff with no department at all
}

/** Builds the department → team → staff tree from live relationships (never hard-coded). */
export async function getOrgTree(): Promise<OrgTree> {
  const [departments, teams, staff] = await Promise.all([listDepartments(), listTeams(), listStaff()]);

  const { data: staffTeamRows, error } = await tbl("platform_staff_teams").select("staff_id, team_id");
  if (error) throw error;
  const teamMembersByTeam = new Map<string, Set<string>>();
  for (const row of (staffTeamRows ?? []) as { staff_id: string; team_id: string }[]) {
    if (!teamMembersByTeam.has(row.team_id)) teamMembersByTeam.set(row.team_id, new Set());
    teamMembersByTeam.get(row.team_id)!.add(row.staff_id);
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const teamsByDepartment = new Map<string, PlatformTeamRow[]>();
  for (const team of teams) {
    const key = team.department_id ?? "__none__";
    if (!teamsByDepartment.has(key)) teamsByDepartment.set(key, []);
    teamsByDepartment.get(key)!.push(team);
  }

  const staffOnAnyTeam = new Set<string>();
  for (const members of teamMembersByTeam.values()) {
    for (const id of members) staffOnAnyTeam.add(id);
  }

  const result: OrgTreeDepartment[] = departments.map((dept) => {
    const deptTeams = (teamsByDepartment.get(dept.id) ?? []).map((team) => ({
      ...team,
      staff: [...(teamMembersByTeam.get(team.id) ?? [])].map((id) => staffById.get(id)).filter(Boolean) as PlatformStaffRow[],
    }));
    const deptStaff = staff.filter((s) => s.department_id === dept.id && !staffOnAnyTeam.has(s.id));
    return { ...dept, teams: deptTeams, staff: deptStaff };
  });

  const unassigned = staff.filter((s) => !s.department_id);

  return { departments: result, unassigned };
}

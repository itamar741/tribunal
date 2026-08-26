import { RepresentativeRole } from "../profiles";
import type { RepresentativeRole as RepresentativeRoleName } from "../profiles";

export const CHARGE_SHEET_BEGIN = "<<<CHARGE_SHEET>>>";
export const CHARGE_SHEET_END = "<<<END_CHARGE_SHEET>>>";

export function advocateResponseBegin(role: RepresentativeRoleName): string {
  return `<<<ADVOCATE_RESPONSE:${role}>>>`;
}

export function advocateResponseEnd(role: RepresentativeRoleName): string {
  return `<<<END_ADVOCATE_RESPONSE:${role}>>>`;
}

export const REPRESENTATIVE_ROLES_IN_ORDER = [
  RepresentativeRole.DEFENSE_1,
  RepresentativeRole.DEFENSE_2,
  RepresentativeRole.PROSECUTION_1,
  RepresentativeRole.PROSECUTION_2,
] as const;

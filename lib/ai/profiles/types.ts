/**
 * Instructor-provided Tribunal agent profile configuration.
 *
 * Profiles are server-side, version-controlled application configuration.
 * Role, side, profile identity, and later model assignment are never
 * taken from model output.
 */

export const TribunalAgentRole = {
  DEFENSE_1: "DEFENSE_1",
  DEFENSE_2: "DEFENSE_2",
  PROSECUTION_1: "PROSECUTION_1",
  PROSECUTION_2: "PROSECUTION_2",
  JUDGE_1: "JUDGE_1",
  JUDGE_2: "JUDGE_2",
  JUDGE_3: "JUDGE_3",
} as const;

export type TribunalAgentRole =
  (typeof TribunalAgentRole)[keyof typeof TribunalAgentRole];

export const RepresentativeRole = {
  DEFENSE_1: TribunalAgentRole.DEFENSE_1,
  DEFENSE_2: TribunalAgentRole.DEFENSE_2,
  PROSECUTION_1: TribunalAgentRole.PROSECUTION_1,
  PROSECUTION_2: TribunalAgentRole.PROSECUTION_2,
} as const;

export type RepresentativeRole =
  (typeof RepresentativeRole)[keyof typeof RepresentativeRole];

export const JudgeRole = {
  JUDGE_1: TribunalAgentRole.JUDGE_1,
  JUDGE_2: TribunalAgentRole.JUDGE_2,
  JUDGE_3: TribunalAgentRole.JUDGE_3,
} as const;

export type JudgeRole = (typeof JudgeRole)[keyof typeof JudgeRole];

export const JUDGE_ROLES_IN_ORDER = [
  JudgeRole.JUDGE_1,
  JudgeRole.JUDGE_2,
  JudgeRole.JUDGE_3,
] as const;

export const AdvocateSide = {
  DEFENSE: "DEFENSE",
  PROSECUTION: "PROSECUTION",
} as const;

export type AdvocateSide = (typeof AdvocateSide)[keyof typeof AdvocateSide];

export type RepresentativeProfile = {
  role: RepresentativeRole;
  characterName: string;
  side: AdvocateSide;
  profileText: string;
};

export type JudgeProfile = {
  role: JudgeRole;
  characterName: string;
  characterSignal: string;
  profileText: string;
};

export type AgentProfile = RepresentativeProfile | JudgeProfile;

export function isRepresentativeRole(
  role: TribunalAgentRole,
): role is RepresentativeRole {
  return Object.values(RepresentativeRole).includes(
    role as RepresentativeRole,
  );
}

export function isJudgeRole(role: TribunalAgentRole): role is JudgeRole {
  return Object.values(JudgeRole).includes(role as JudgeRole);
}

export function isRepresentativeProfile(
  profile: AgentProfile,
): profile is RepresentativeProfile {
  return isRepresentativeRole(profile.role);
}

export function isJudgeProfile(profile: AgentProfile): profile is JudgeProfile {
  return isJudgeRole(profile.role);
}

import { judgeProfiles } from "./judges";
import { representativeProfiles } from "./representatives";
import {
  JudgeRole,
  RepresentativeRole,
  TribunalAgentRole,
  isJudgeProfile,
  isRepresentativeProfile,
  type AgentProfile,
  type JudgeProfile,
  type RepresentativeProfile,
} from "./types";

export const agentProfiles = {
  [TribunalAgentRole.DEFENSE_1]:
    representativeProfiles[RepresentativeRole.DEFENSE_1],
  [TribunalAgentRole.DEFENSE_2]:
    representativeProfiles[RepresentativeRole.DEFENSE_2],
  [TribunalAgentRole.PROSECUTION_1]:
    representativeProfiles[RepresentativeRole.PROSECUTION_1],
  [TribunalAgentRole.PROSECUTION_2]:
    representativeProfiles[RepresentativeRole.PROSECUTION_2],
  [TribunalAgentRole.JUDGE_1]: judgeProfiles[JudgeRole.JUDGE_1],
  [TribunalAgentRole.JUDGE_2]: judgeProfiles[JudgeRole.JUDGE_2],
  [TribunalAgentRole.JUDGE_3]: judgeProfiles[JudgeRole.JUDGE_3],
} as const satisfies Record<TribunalAgentRole, AgentProfile>;

export function getAgentProfile(role: TribunalAgentRole): AgentProfile {
  return agentProfiles[role];
}

export function listRepresentativeProfiles(): RepresentativeProfile[] {
  return Object.values(representativeProfiles);
}

export function listJudgeProfiles(): JudgeProfile[] {
  return Object.values(judgeProfiles);
}

export function listAgentProfiles(): AgentProfile[] {
  return Object.values(agentProfiles);
}

export function getRepresentativeProfile(
  role: RepresentativeRole,
): RepresentativeProfile {
  const profile = agentProfiles[role];
  if (!isRepresentativeProfile(profile)) {
    throw new Error(`Expected representative profile for ${role}`);
  }
  return profile;
}

export function getJudgeProfile(role: JudgeRole): JudgeProfile {
  const profile = agentProfiles[role];
  if (!isJudgeProfile(profile)) {
    throw new Error(`Expected judge profile for ${role}`);
  }
  return profile;
}

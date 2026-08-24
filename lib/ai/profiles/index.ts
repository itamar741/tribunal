/**
 * Instructor-provided agent profiles.
 *
 * Settled rules:
 * - Profiles are hard-coded application configuration.
 * - Profiles are version-controlled and not user-editable.
 * - Profiles remain server-side only.
 * - Role, side, and profile identity are never taken from model output.
 * - Model IDs are not part of profile configuration.
 * - Representative seats assign a procedural side only; the model
 *   reasons in character under REPRESENTATIVE_SIMULATION_RULE.
 * - Judge seats are judicial-method simulation profiles under
 *   JUDGE_SIMULATION_QUALIFICATION.
 * - Dossier Section 6 research citations are provenance, not
 *   additional runtime profile text.
 */

export * from "./types";

export {
  REPRESENTATIVE_SIMULATION_RULE,
  representativeProfiles,
} from "./representatives";
export {
  JUDGE_SIMULATION_QUALIFICATION,
  judgeProfiles,
} from "./judges";
export {
  agentProfiles,
  getAgentProfile,
  getJudgeProfile,
  getRepresentativeProfile,
  listAgentProfiles,
  listJudgeProfiles,
  listRepresentativeProfiles,
} from "./catalog";

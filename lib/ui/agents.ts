import type { JudgeRoleView, RepresentativeRoleView } from "./types";

export const REPRESENTATIVE_ROLES = [
  "DEFENSE_1",
  "DEFENSE_2",
  "PROSECUTION_1",
  "PROSECUTION_2",
] as const satisfies readonly RepresentativeRoleView[];

export const JUDGE_ROLES = [
  "JUDGE_1",
  "JUDGE_2",
  "JUDGE_3",
] as const satisfies readonly JudgeRoleView[];

export const REPRESENTATIVE_DISPLAY: Record<
  RepresentativeRoleView,
  { characterName: string; side: "Defense" | "Prosecution" }
> = {
  DEFENSE_1: { characterName: "Jon Snow", side: "Defense" },
  DEFENSE_2: { characterName: "Tyrion Lannister", side: "Defense" },
  PROSECUTION_1: { characterName: "Daenerys Targaryen", side: "Prosecution" },
  PROSECUTION_2: { characterName: "Grey Worm", side: "Prosecution" },
};

export const JUDGE_DISPLAY: Record<JudgeRoleView, { characterName: string }> = {
  JUDGE_1: { characterName: "Aaron Barak" },
  JUDGE_2: { characterName: "Menachem Elon" },
  JUDGE_3: { characterName: "Meir Shamgar" },
};

export const JUDGE_SIMULATION_NOTE =
  "These judicial profiles simulate method. They do not predict the opinions of the named judges.";

export const RUN_STRATEGY_LABEL = {
  SAME_MODEL: "Same model for every agent",
  MIXED_MODELS: "A distinct model for each agent",
} as const;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModelCallAgentRole } from "../../model-calls/types";
import {
  AdvocateSide,
  JUDGE_SIMULATION_QUALIFICATION,
  JudgeRole,
  REPRESENTATIVE_SIMULATION_RULE,
  RepresentativeRole,
  TribunalAgentRole,
  agentProfiles,
  getAgentProfile,
  isJudgeProfile,
  isRepresentativeProfile,
  listAgentProfiles,
  listJudgeProfiles,
  listRepresentativeProfiles,
} from "./index";

const EXPECTED_CHARACTER_BY_ROLE = {
  [TribunalAgentRole.DEFENSE_1]: "Jon Snow",
  [TribunalAgentRole.DEFENSE_2]: "Tyrion Lannister",
  [TribunalAgentRole.PROSECUTION_1]: "Daenerys Targaryen",
  [TribunalAgentRole.PROSECUTION_2]: "Grey Worm",
  [TribunalAgentRole.JUDGE_1]: "Aaron Barak",
  [TribunalAgentRole.JUDGE_2]: "Menachem Elon",
  [TribunalAgentRole.JUDGE_3]: "Meir Shamgar",
} as const;

const MODEL_ID_KEYS = ["model", "modelId", "modelID", "openRouterModel"] as const;

function assertNonEmpty(value: string, label: string): void {
  assert.equal(value.trim().length > 0, true, `${label} must be non-empty`);
}

describe("agent profile configuration", () => {
  it("defines exactly four representative seats", () => {
    const representatives = listRepresentativeProfiles();

    assert.equal(representatives.length, 4);
    assert.deepEqual(
      representatives.map((profile) => profile.role).sort(),
      Object.values(RepresentativeRole).sort(),
    );
  });

  it("defines exactly three judge seats", () => {
    const judges = listJudgeProfiles();

    assert.equal(judges.length, 3);
    assert.deepEqual(
      judges.map((profile) => profile.role).sort(),
      Object.values(JudgeRole).sort(),
    );
  });

  it("represents all seven agent roles exactly once", () => {
    const profiles = listAgentProfiles();
    const roles = profiles.map((profile) => profile.role);

    assert.equal(profiles.length, 7);
    assert.deepEqual(roles.sort(), Object.values(TribunalAgentRole).sort());
    assert.equal(new Set(roles).size, 7);
    assert.deepEqual(
      Object.keys(agentProfiles).sort(),
      Object.values(TribunalAgentRole).sort(),
    );
  });

  it("keeps profile roles aligned with Model Call agent roles", () => {
    assert.deepEqual(
      Object.values(TribunalAgentRole).sort(),
      Object.values(ModelCallAgentRole).sort(),
    );
  });

  it("maps each role to the instructor character", () => {
    for (const role of Object.values(TribunalAgentRole)) {
      assert.equal(
        getAgentProfile(role).characterName,
        EXPECTED_CHARACTER_BY_ROLE[role],
      );
    }
  });

  it("maps defense and prosecution seats to the assigned procedural side", () => {
    const representatives = listRepresentativeProfiles();

    for (const profile of representatives) {
      assert.equal(isRepresentativeProfile(profile), true);
      if (
        profile.role === RepresentativeRole.DEFENSE_1 ||
        profile.role === RepresentativeRole.DEFENSE_2
      ) {
        assert.equal(profile.side, AdvocateSide.DEFENSE);
      } else {
        assert.equal(profile.side, AdvocateSide.PROSECUTION);
      }
    }

    assert.equal(
      representatives.filter((profile) => profile.side === AdvocateSide.DEFENSE)
        .length,
      2,
    );
    assert.equal(
      representatives.filter(
        (profile) => profile.side === AdvocateSide.PROSECUTION,
      ).length,
      2,
    );
  });

  it("does not assign an advocate side to judge profiles", () => {
    for (const profile of listJudgeProfiles()) {
      assert.equal(isJudgeProfile(profile), true);
      assert.equal("side" in profile, false);
    }
  });

  it("does not embed model IDs in profile configuration", () => {
    for (const profile of listAgentProfiles()) {
      for (const key of MODEL_ID_KEYS) {
        assert.equal(key in profile, false);
      }
    }

    assert.equal("model" in agentProfiles, false);
  });

  it("keeps every profile text and identity field non-empty", () => {
    assertNonEmpty(REPRESENTATIVE_SIMULATION_RULE, "simulation rule");
    assertNonEmpty(
      JUDGE_SIMULATION_QUALIFICATION,
      "judge simulation qualification",
    );

    for (const profile of listAgentProfiles()) {
      assertNonEmpty(profile.role, `${profile.role} role`);
      assertNonEmpty(profile.characterName, `${profile.role} characterName`);
      assertNonEmpty(profile.profileText, `${profile.role} profileText`);
      if (isJudgeProfile(profile)) {
        assertNonEmpty(profile.characterSignal, `${profile.role} characterSignal`);
      }
    }
  });
});

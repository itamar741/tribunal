import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdvocateResponse } from "../contracts";
import {
  JudgeRole,
  RepresentativeRole,
  TribunalAgentRole,
  agentProfiles,
  listAgentProfiles,
} from "../profiles";
import { buildJudgePrompt, buildRepresentativePrompt } from "../prompts";
import {
  MIXED_MODELS_BY_ROLE,
  ROLE_MODEL_ASSIGNMENTS,
  SAME_MODEL_BY_ROLE,
  SAME_MODEL_ID,
  STANDBY_MODEL_IDS,
  TribunalRunKind,
  getModelIdForRole,
  getRoleModelAssignment,
  listStandbyModelIds,
} from "./index";

const FORBIDDEN_ROUTER_ID = "openrouter/free";

const PRIMARY_MODEL_IDS = [
  ...new Set([
    ...Object.values(SAME_MODEL_BY_ROLE),
    ...Object.values(MIXED_MODELS_BY_ROLE),
  ]),
];

const SAMPLE_ADVOCATE_RESPONSE: AdvocateResponse = {
  summary: "The supplied record supports this side.",
  arguments: [
    {
      title: "Surrender had occurred",
      argument: "The charge sheet records that organized resistance had ceased.",
    },
    {
      title: "The act was intentional",
      argument:
        "The charge sheet records an intentional killing during an embrace.",
    },
    {
      title: "Safer alternatives are disputed",
      argument:
        "The charge sheet records that no council or detention was attempted.",
    },
  ],
  conclusion: "The assigned side should prevail on these facts.",
};

function sampleAdvocateResponses(): Record<
  RepresentativeRole,
  AdvocateResponse
> {
  return {
    [RepresentativeRole.DEFENSE_1]: SAMPLE_ADVOCATE_RESPONSE,
    [RepresentativeRole.DEFENSE_2]: SAMPLE_ADVOCATE_RESPONSE,
    [RepresentativeRole.PROSECUTION_1]: SAMPLE_ADVOCATE_RESPONSE,
    [RepresentativeRole.PROSECUTION_2]: SAMPLE_ADVOCATE_RESPONSE,
  };
}

describe("SAME_MODEL assignment", () => {
  it("resolves all seven roles to exactly one identical model ID", () => {
    const roles = Object.values(TribunalAgentRole);
    const resolved = roles.map((role) =>
      getModelIdForRole(TribunalRunKind.SAME_MODEL, role),
    );

    assert.equal(roles.length, 7);
    assert.deepEqual(
      Object.keys(SAME_MODEL_BY_ROLE).sort(),
      roles.slice().sort(),
    );
    assert.equal(new Set(resolved).size, 1);
    assert.equal(
      resolved.every((modelId) => modelId === SAME_MODEL_ID),
      true,
    );
  });

  it("uses openai/gpt-oss-120b:free as the homogeneous baseline", () => {
    assert.equal(SAME_MODEL_ID, "openai/gpt-oss-120b:free");
    assert.equal(
      getRoleModelAssignment(TribunalRunKind.SAME_MODEL),
      SAME_MODEL_BY_ROLE,
    );
  });
});

describe("MIXED_MODELS assignment", () => {
  it("contains all seven roles exactly once", () => {
    const roles = Object.keys(MIXED_MODELS_BY_ROLE);

    assert.equal(roles.length, 7);
    assert.deepEqual(roles.sort(), Object.values(TribunalAgentRole).sort());
    assert.equal(new Set(roles).size, 7);
  });

  it("assigns exactly seven distinct model IDs", () => {
    const modelIds = Object.values(MIXED_MODELS_BY_ROLE);

    assert.equal(modelIds.length, 7);
    assert.equal(new Set(modelIds).size, 7);

    for (const role of Object.values(TribunalAgentRole)) {
      assert.equal(
        getModelIdForRole(TribunalRunKind.MIXED_MODELS, role),
        MIXED_MODELS_BY_ROLE[role],
      );
    }
  });
});

describe("model-selection constraints", () => {
  it("marks every current primary ID as a :free endpoint", () => {
    for (const modelId of PRIMARY_MODEL_IDS) {
      assert.match(modelId, /:free$/);
    }
  });

  it("does not use openrouter/free", () => {
    const configured = JSON.stringify({
      SAME_MODEL_ID,
      SAME_MODEL_BY_ROLE,
      MIXED_MODELS_BY_ROLE,
      STANDBY_MODEL_IDS,
      ROLE_MODEL_ASSIGNMENTS,
    });

    assert.equal(configured.includes(FORBIDDEN_ROUTER_ID), false);

    for (const role of Object.values(TribunalAgentRole)) {
      for (const runKind of Object.values(TribunalRunKind)) {
        assert.notEqual(getModelIdForRole(runKind, role), FORBIDDEN_ROUTER_ID);
      }
    }
  });

  it("keeps the standby pool unique and outside automatic role resolution", () => {
    assert.deepEqual(listStandbyModelIds(), STANDBY_MODEL_IDS);
    assert.equal(STANDBY_MODEL_IDS.length, 3);
    assert.equal(new Set(STANDBY_MODEL_IDS).size, STANDBY_MODEL_IDS.length);

    const resolved = Object.values(TribunalAgentRole).flatMap((role) =>
      Object.values(TribunalRunKind).map((runKind) =>
        getModelIdForRole(runKind, role),
      ),
    );
    const sameModelIds: readonly string[] = Object.values(SAME_MODEL_BY_ROLE);
    const mixedModelIds: readonly string[] = Object.values(MIXED_MODELS_BY_ROLE);

    for (const standbyId of STANDBY_MODEL_IDS) {
      assert.equal(resolved.includes(standbyId), false);
      assert.equal(sameModelIds.includes(standbyId), false);
      assert.equal(mixedModelIds.includes(standbyId), false);
    }
  });

  it("rejects unknown run kinds and roles at resolution time", () => {
    assert.throws(
      () =>
        getModelIdForRole(
          "UNKNOWN_RUN" as TribunalRunKind,
          TribunalAgentRole.DEFENSE_1,
        ),
      /Unknown Tribunal run kind/,
    );
    assert.throws(
      () =>
        getModelIdForRole(
          TribunalRunKind.MIXED_MODELS,
          "NOT_A_ROLE" as TribunalAgentRole,
        ),
      /No model configured/,
    );
  });
});

describe("model independence of profiles and prompts", () => {
  it("keeps profiles and prompt builders free of model IDs", () => {
    const profileCatalog = JSON.stringify({
      agentProfiles,
      profiles: listAgentProfiles(),
    });
    const representativePrompt = JSON.stringify(
      buildRepresentativePrompt({
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "# Case T-TEST\n\nThe accused killed the deceased.",
      }),
    );
    const judgePrompt = JSON.stringify(
      buildJudgePrompt({
        role: JudgeRole.JUDGE_1,
        chargeSheetMarkdown: "# Case T-TEST\n\nThe accused killed the deceased.",
        advocateResponses: sampleAdvocateResponses(),
      }),
    );

    const forbidden = [
      ...PRIMARY_MODEL_IDS,
      ...STANDBY_MODEL_IDS,
      FORBIDDEN_ROUTER_ID,
    ];

    for (const modelId of forbidden) {
      assert.equal(profileCatalog.includes(modelId), false, modelId);
      assert.equal(representativePrompt.includes(modelId), false, modelId);
      assert.equal(judgePrompt.includes(modelId), false, modelId);
    }

    for (const profile of listAgentProfiles()) {
      assert.equal("model" in profile, false);
      assert.equal("modelId" in profile, false);
    }
  });
});

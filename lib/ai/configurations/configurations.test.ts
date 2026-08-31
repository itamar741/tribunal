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
  EXPLICITLY_PAID_MODEL_IDS,
  MIXED_MODELS_BY_ROLE,
  MODEL_OUTPUT_MODES,
  ModelOutputMode,
  ROLE_MODEL_ASSIGNMENTS,
  SAME_MODEL_BY_ROLE,
  SAME_MODEL_ID,
  STANDBY_MODEL_IDS,
  TribunalRunKind,
  getModelIdForRole,
  getOutputModeForModel,
  getRoleModelAssignment,
  isExplicitlyPaidModelId,
  listConfiguredModelIds,
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

  it("uses minimax/minimax-m3:free as the homogeneous baseline", () => {
    assert.equal(SAME_MODEL_ID, "minimax/minimax-m3:free");
    for (const role of Object.values(TribunalAgentRole)) {
      assert.equal(
        getModelIdForRole(TribunalRunKind.SAME_MODEL, role),
        "minimax/minimax-m3:free",
      );
    }
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
    assert.deepEqual(MIXED_MODELS_BY_ROLE, {
      [TribunalAgentRole.DEFENSE_1]: "openai/gpt-4.1-mini",
      [TribunalAgentRole.DEFENSE_2]: "mistralai/mistral-small-3.2-24b-instruct",
      [TribunalAgentRole.PROSECUTION_1]: "qwen/qwen3-30b-a3b-instruct-2507",
      [TribunalAgentRole.PROSECUTION_2]: "minimax/minimax-m3:free",
      [TribunalAgentRole.JUDGE_1]: "openai/gpt-4.1",
      [TribunalAgentRole.JUDGE_2]: "nvidia/nemotron-3-super-120b-a12b:free",
      [TribunalAgentRole.JUDGE_3]: "meta-llama/llama-4-maverick",
    });

    for (const role of Object.values(TribunalAgentRole)) {
      assert.equal(
        getModelIdForRole(TribunalRunKind.MIXED_MODELS, role),
        MIXED_MODELS_BY_ROLE[role],
      );
    }
  });
});

describe("model-selection constraints", () => {
  it("allows only the documented paid primary IDs", () => {
    assert.deepEqual(EXPLICITLY_PAID_MODEL_IDS, [
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1",
      "meta-llama/llama-4-maverick",
      "mistralai/mistral-small-3.2-24b-instruct",
      "qwen/qwen3-30b-a3b-instruct-2507",
    ]);
    assert.equal(isExplicitlyPaidModelId("openai/gpt-4.1-mini"), true);
    assert.equal(isExplicitlyPaidModelId("openai/gpt-4.1"), true);
    assert.equal(isExplicitlyPaidModelId("meta-llama/llama-4-maverick"), true);
    assert.equal(isExplicitlyPaidModelId("mistralai/mistral-small-3.2-24b-instruct"), true);
    assert.equal(isExplicitlyPaidModelId("qwen/qwen3-30b-a3b-instruct-2507"), true);
    assert.equal(isExplicitlyPaidModelId("openai/gpt-oss-120b"), false);
    assert.equal(
      MIXED_MODELS_BY_ROLE[TribunalAgentRole.DEFENSE_1],
      "openai/gpt-4.1-mini",
    );
    assert.equal(
      MIXED_MODELS_BY_ROLE[TribunalAgentRole.JUDGE_1],
      "openai/gpt-4.1",
    );
    assert.equal(
      MIXED_MODELS_BY_ROLE[TribunalAgentRole.JUDGE_3],
      "meta-llama/llama-4-maverick",
    );
    assert.equal(PRIMARY_MODEL_IDS.includes("openai/gpt-4.1-mini"), true);
    assert.equal(PRIMARY_MODEL_IDS.includes("openai/gpt-4.1"), true);
    assert.equal(
      PRIMARY_MODEL_IDS.includes("meta-llama/llama-4-maverick"),
      true,
    );
    assert.equal(
      (PRIMARY_MODEL_IDS as readonly string[]).includes("openai/gpt-oss-120b"),
      false,
    );

    const expectedFree = [
      ...PRIMARY_MODEL_IDS,
      ...STANDBY_MODEL_IDS,
    ].filter((modelId) => !isExplicitlyPaidModelId(modelId));

    for (const modelId of expectedFree) {
      assert.match(modelId, /:free$/);
      assert.equal(isExplicitlyPaidModelId(modelId), false);
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
    assert.deepEqual(STANDBY_MODEL_IDS, [
      "google/gemma-4-31b-it:free",
      "cohere/north-mini-code:free",
      "nvidia/nemotron-3.5-lightning:free",
      "inclusionai/ling-3.0-flash-fin:free",
      "z-ai/glm-5.2:free",
      "google/gemma-4-26b-a4b-it:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ]);
    assert.equal(
      STANDBY_MODEL_IDS.includes("nvidia/nemotron-3-ultra-550b-a55b:free"),
      false,
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "nvidia/nemotron-3.5-lightning:free",
      ),
      false,
    );
    assert.equal(
      MIXED_MODELS_BY_ROLE[TribunalAgentRole.DEFENSE_1],
      "openai/gpt-4.1-mini",
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "openai/gpt-oss-120b",
      ),
      false,
    );
    assert.equal(
      STANDBY_MODEL_IDS.includes("openai/gpt-oss-120b"),
      false,
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "liquid/lfm-2.5-2.6b:free",
      ),
      false,
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "dots-studio/dots-3-note-preview:free",
      ),
      false,
    );
    assert.equal(
      STANDBY_MODEL_IDS.includes("dots-studio/dots-3-note-preview:free"),
      false,
    );
    assert.equal(
      STANDBY_MODEL_IDS.includes("liquid/lfm-2.5-2.6b:free"),
      false,
    );
    assert.equal(
      MIXED_MODELS_BY_ROLE[TribunalAgentRole.JUDGE_2],
      "nvidia/nemotron-3-super-120b-a12b:free",
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "z-ai/glm-5.2:free",
      ),
      false,
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "google/gemma-4-26b-a4b-it:free",
      ),
      false,
    );
    assert.equal(
      MIXED_MODELS_BY_ROLE[TribunalAgentRole.PROSECUTION_1],
      "qwen/qwen3-30b-a3b-instruct-2507",
    );
    assert.equal(
      (Object.values(MIXED_MODELS_BY_ROLE) as readonly string[]).includes(
        "google/gemma-4-31b-it:free",
      ),
      false,
    );
    assert.equal(STANDBY_MODEL_IDS.length, 7);
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
    assert.equal(profileCatalog.includes("JSON_SCHEMA"), false);
    assert.equal(profileCatalog.includes("JSON_OBJECT"), false);
    assert.equal(profileCatalog.includes("PROMPT_ONLY"), false);
    assert.equal(representativePrompt.includes("JSON_SCHEMA"), false);
    assert.equal(judgePrompt.includes("response_format"), false);
  });
});

describe("model output modes", () => {
  it("assigns an explicit output mode to every configured primary and standby ID", () => {
    const configured = [...new Set(listConfiguredModelIds())].sort();
    const mapped = Object.keys(MODEL_OUTPUT_MODES).sort();
    assert.deepEqual(configured, mapped);

    assert.equal(
      getOutputModeForModel("openai/gpt-4.1"),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("meta-llama/llama-4-maverick"),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("nvidia/nemotron-3-super-120b-a12b:free"),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("minimax/minimax-m3:free"),
      ModelOutputMode.JSON_OBJECT,
    );
    assert.equal(
      getOutputModeForModel("mistralai/mistral-small-3.2-24b-instruct"),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("qwen/qwen3-30b-a3b-instruct-2507"),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("google/gemma-4-31b-it:free"),
      ModelOutputMode.JSON_OBJECT,
    );
    assert.equal(
      getOutputModeForModel(
        MIXED_MODELS_BY_ROLE[TribunalAgentRole.JUDGE_1],
      ),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel(
        MIXED_MODELS_BY_ROLE[TribunalAgentRole.JUDGE_3],
      ),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel(
        MIXED_MODELS_BY_ROLE[TribunalAgentRole.DEFENSE_1],
      ),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("openai/gpt-4.1-mini"),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel(
        MIXED_MODELS_BY_ROLE[TribunalAgentRole.PROSECUTION_1],
      ),
      ModelOutputMode.JSON_SCHEMA,
    );
    assert.equal(
      getOutputModeForModel("nvidia/nemotron-3.5-lightning:free"),
      ModelOutputMode.PROMPT_ONLY,
    );
    assert.equal(
      getOutputModeForModel("cohere/north-mini-code:free"),
      ModelOutputMode.PROMPT_ONLY,
    );
    assert.throws(
      () => getOutputModeForModel("openrouter/free"),
      /No output mode configured/,
    );
  });
});

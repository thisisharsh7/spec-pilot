import { OPENAI_FIXTURE_MODELS, FIXTURE_VERIFIED_AT } from "@/lib/data/fixtures/openai";
import type {
  NormalizedModel,
  ProviderHealth,
} from "@/lib/domain/model";
import { PROVIDERS } from "@/lib/domain/providers";
import type { ModelRepository } from "@/lib/data/repository";

/*
  Development-data repository.

  Reports its own provenance honestly: freshness is "fixture", never "fresh", and
  no collector is described as having run. Whether a collector ID is *configured*
  is reported by env-var NAME only — the value is never read into the result.
*/


export class FixtureModelRepository implements ModelRepository {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  async listModels(): Promise<NormalizedModel[]> {
    return OPENAI_FIXTURE_MODELS;
  }

  async getProviderHealth(): Promise<ProviderHealth[]> {
    return PROVIDERS.map((entry) => {
      const models = OPENAI_FIXTURE_MODELS.filter(
        (model) => model.provider === entry.slug,
      );

      return {
        provider: entry.slug,
        displayName: entry.displayName,
        sourceUrl: entry.sourceUrl,
        collectorConfigured: Boolean(this.env[entry.collectorEnvKey]),
        collectorEnvKey: entry.collectorEnvKey,
        // No collector has run in fixture mode. Saying otherwise would be a lie.
        lastSuccessfulRefreshAt: null,
        recordsReceived: null,
        recordsValid: models.length > 0 ? models.length : null,
        state: "not_configured",
        lastErrorMessage: null,
        freshness: "fixture",
      } satisfies ProviderHealth;
    });
  }
}

export { FIXTURE_VERIFIED_AT };

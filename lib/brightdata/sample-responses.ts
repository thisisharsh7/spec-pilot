/*
  VERBATIM output from the real Bright Data collector `specpilot-openai-models-html`
  (its id is configured via env, never committed), captured from two runs against the
  rendered OpenAI model reference pages. Nothing here is hand-written or idealised.

  These are the regression fixtures for `normalize.ts`. They deliberately preserve
  the collector's real quirks:

  · `pricing_note` is OMITTED entirely on gpt-4.1-nano (that page states no tier
    rule) rather than being returned as null — so the schema must tolerate a
    missing key rather than requiring it.
  · Modalities come back title-cased ("Text", "Image").
  · Feature names are human labels ("Function calling"), not API slugs.
  · The rendered page exposes fewer features than the .md variant, and does NOT
    mention file uploads at all — so document support is genuinely unverifiable
    from this source and must normalize to null, never false.
  · gpt-5.6-luna carries an explicit negative: Fine-tuning "Not supported".
*/

/** Run 1: gpt-4.1-nano — older page layout, no tier note. */
export const REAL_RUN_GPT_41_NANO = {
  "model_id": "gpt-4.1-nano",
  "url": "https://developers.openai.com/api/docs/models/gpt-4.1-nano",
  "locale": "en_US",
  "display_name": "GPT-4.1 nano",
  "input_modalities": [
    "Text",
    "Image"
  ],
  "output_modalities": [
    "Text"
  ],
  "context_window_tokens": 1047576,
  "max_output_tokens": 32768,
  "features": [
    {
      "feature_name": "Streaming",
      "status": "Supported"
    },
    {
      "feature_name": "Function calling",
      "status": "Supported"
    },
    {
      "feature_name": "Structured outputs",
      "status": "Supported"
    },
    {
      "feature_name": "Fine-tuning",
      "status": "Supported"
    },
    {
      "feature_name": "Predicted outputs",
      "status": "Supported"
    }
  ],
  "standard_input_usd_per_1m": 0.1,
  "standard_cached_input_usd_per_1m": 0.025,
  "standard_output_usd_per_1m": 0.4,
  "input": {
    "url": "https://developers.openai.com/api/docs/models/gpt-4.1-nano"
  }
} as const;

/** Run 2: gpt-5.6-luna — newer layout, tier note present, one explicit negative. */
export const REAL_RUN_GPT_56_LUNA = {
  "model_id": "gpt-5.6-luna",
  "url": "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
  "locale": "en_US",
  "display_name": "GPT-5.6 Luna",
  "input_modalities": [
    "Text",
    "Image"
  ],
  "output_modalities": [
    "Text"
  ],
  "context_window_tokens": 1050000,
  "max_output_tokens": 128000,
  "features": [
    {
      "feature_name": "Streaming",
      "status": "Supported"
    },
    {
      "feature_name": "Function calling",
      "status": "Supported"
    },
    {
      "feature_name": "Structured outputs",
      "status": "Supported"
    },
    {
      "feature_name": "Fine-tuning",
      "status": "Not supported"
    }
  ],
  "standard_input_usd_per_1m": 0.2,
  "standard_cached_input_usd_per_1m": 0.02,
  "standard_output_usd_per_1m": 1.2,
  "pricing_note": "Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request. Cache writes are billed at 1.25x the uncached input token rate.",
  "input": {
    "url": "https://developers.openai.com/api/docs/models/gpt-5.6-luna"
  }
} as const;

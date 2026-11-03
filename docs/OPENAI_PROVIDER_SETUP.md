# CivilOS AI — AI Provider Configuration

The authenticated `ai-chat` Supabase Edge Function supports server-selected providers:

- `openai` — OpenAI Responses API (recommended default).
- `openrouter` — OpenRouter Chat Completions API; select any model available to the configured OpenRouter account.

The browser never chooses a provider/model and never receives provider API keys. Provider switching is performed only by changing Supabase Edge Function secrets. Only one provider is active for this endpoint at a time; this is not simultaneous multi-provider fan-out or automatic fallback.

## OpenAI (recommended default)

Set these Edge Function secrets in the Supabase dashboard:

- `AI_PROVIDER` = `openai`
- `OPENAI_API_KEY` = your OpenAI API key
- `OPENAI_MODEL` = `gpt-5.5` (or a model enabled for your API project)

## OpenRouter

Set:

- `AI_PROVIDER` = `openrouter`
- `OPENROUTER_API_KEY` = your OpenRouter API key
- `OPENROUTER_MODEL` = the exact model slug from OpenRouter, for example `openai/gpt-4o-mini`
- `OPENROUTER_SITE_URL` = `https://civilosai.pro.bd` (optional attribution header)

The model slug must be available to the OpenRouter account and support streaming Chat Completions. Model availability, provider routing, rate limits and pricing are controlled by OpenRouter.

## Security and behavior

- Store all provider keys only in Supabase Edge Function Secrets. Never use `VITE_*`, frontend code, localStorage, GitHub files or browser requests for private keys.
- Keep `verify_jwt = true`; the function validates the signed-in Supabase user.
- Per-user rate limiting and CivilOS AI credit checks remain server-side.
- The provider and model are controlled by server secrets; clients cannot override either.
- Conversation plus reference context is capped at 40,000 characters; individual reference context is capped at 10,000 characters.
- Uploaded reference material is passed as untrusted user data, not appended to the trusted system instructions.
- OpenAI Responses requests use `store: false`.
- A ChatGPT subscription does not include OpenAI API credits. OpenAI and OpenRouter API usage are billed separately under their respective accounts.
- The function does not silently fall back to another provider. This prevents unexpected provider billing and model changes.

## Deploy and verify (after PR merge and explicit production approval)

Deploy the updated function to the intended Supabase project only after reviewing the PR and confirming the required secrets are configured. Frontend Vercel deployment does not deploy Supabase Edge Functions.

Test the AI Engineering Assistant with Bangla and English prompts, verify streaming, test an oversized request returns 413, and inspect function logs for status-only provider failures. Never log or expose API keys.

## Future provider additions

The provider adapter can be extended for other vendors that expose compatible APIs (for example Groq, Together AI or Fireworks). Each provider should receive its own server-side secret and explicit endpoint/model mapping; do not accept arbitrary API URLs or credentials from the browser. Add a provider-specific streaming adapter and tests before enabling it.

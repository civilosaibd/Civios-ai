# CivilOS AI — OpenAI Provider Setup

The `ai-chat` Supabase Edge Function supports two server-selected providers:

- `lovable` (default): existing Gemini route through the Lovable AI gateway.
- `openai`: OpenAI Responses API with streamed text adapted to the existing CivilOS chat clients.

The provider is selected only by server-side environment variables. The browser cannot submit an API key, select a model, or override the provider.

## 1. Add secrets in Supabase

Open the CivilOS-AI Supabase project:

1. Go to **Project Settings → Edge Functions → Secrets** (or the Edge Function Secrets page in the Supabase dashboard).
2. Add:
   - `AI_PROVIDER` = `openai`
   - `OPENAI_API_KEY` = your OpenAI API key
   - `OPENAI_MODEL` = `gpt-5.5` (optional; this is the code default)
3. Save the secrets.

Never put `OPENAI_API_KEY` in Vite variables, frontend source, GitHub commits, localStorage, or browser requests. Do not share it in chat or screenshots.

You can alternatively set the secrets with the Supabase CLI from a trusted terminal:

```bash
supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=YOUR_OPENAI_API_KEY OPENAI_MODEL=gpt-5.5 --project-ref kdsoubdybjfgppglzldn
```

Replace the placeholder locally. Do not commit a real key or paste it into a command that will be saved in shell history.

## 2. Deploy the Edge Function

Deploy the updated `ai-chat` function after merging this change:

```bash
supabase functions deploy ai-chat --project-ref kdsoubdybjfgppglzldn
```

Keep JWT verification enabled. The function validates the signed-in Supabase user, applies the existing per-user rate limit and AI-credit quota, and only then calls the provider.

## 3. Verify

1. Sign in to CivilOS AI.
2. Open **AI Engineering Assistant** or the existing AI Assistant page.
3. Send a short test prompt in Bangla and another in English.
4. Confirm the answer streams into the existing chat interface.
5. Check Supabase Edge Function logs for provider request errors. Never log or expose the API key.

If OpenAI is not configured, the function returns a clear 503 response. It does not silently switch providers, which avoids unexpected billing or provider changes.

## 4. Switch back

Set `AI_PROVIDER=lovable` in Edge Function Secrets to return to the existing Gemini route. The OpenAI key can then be removed from project secrets if no longer needed.

## Privacy and cost notes

- OpenAI requests set `store: false`.
- OpenAI API usage is billed separately by OpenAI; a ChatGPT subscription does not include API credits.
- The existing CivilOS AI quota and rate-limit checks remain in front of both providers.
- The app's own CivilOS branding remains in the UI; this integration does not add a ChatGPT watermark or logo.
- Model availability, rate limits and pricing depend on the OpenAI API project and account.

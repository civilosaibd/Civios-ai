CivilOS AI — Security Patch 1

Files:
- ai-analyze.index.ts: authenticated-user verification, POST-only handling, input validation/size guard, safer public errors.
- config.toml: sets verify_jwt = true for ai-analyze.

IMPORTANT:
1. This patch has NOT been pushed to GitHub or deployed. The connected GitHub integration rejected write/branch permissions (HTTP 403), so no repository files were changed.
2. Apply it to a separate branch first and preserve any unrelated edits.
3. Confirm AIThinking is only accessible to signed-in users before deploying.
4. Deploy the Supabase Edge Function/config through Supabase, not just Vercel.
5. Test: signed-out request => 401; signed-in valid request => AI response; invalid body => 400; oversized image => 413; provider errors => safe error response.
6. Configure LOVABLE_API_KEY as a Supabase Edge Function secret; never use a VITE_ variable for it.
7. This is an initial security improvement, not a full rate-limit or subscription-entitlement implementation.

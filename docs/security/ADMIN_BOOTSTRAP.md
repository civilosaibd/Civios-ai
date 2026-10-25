# CivilOS AI — administrator bootstrap

Global administrator access must be granted through a trusted operator action, never automatically during public signup.

## Safe bootstrap procedure

1. Sign in to the intended Supabase project and verify that the owner's account exists in Authentication → Users. Confirm its email and copy the immutable Auth user UUID.
2. Before changing roles, verify that the account's email is included in the allowlist enforced by `public.has_role`. Do not expand the allowlist casually; changes must be reviewed and committed as a migration.
3. In the SQL Editor for that same verified project, run the following with the exact UUID copied from Auth:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<verified-owner-auth-user-uuid>'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

4. Verify the result before using the admin panel:

```sql
SELECT u.id, u.email, public.has_role(u.id, 'admin'::public.app_role) AS is_admin
FROM auth.users AS u
WHERE u.id = '<verified-owner-auth-user-uuid>'::uuid;
```

5. Keep the SQL Editor restricted to trusted project operators. Never expose the service-role key in the browser or commit it to Git.

## Rollout safety

The signup-trigger migration only changes how future users are assigned roles; it does not delete or modify existing `user_roles` rows. Before applying it to production, confirm that at least one trusted owner account already has a valid admin role and passes `public.has_role`. If no valid owner admin exists, bootstrap it first. The trigger continues to create the profile and referral attribution as before.

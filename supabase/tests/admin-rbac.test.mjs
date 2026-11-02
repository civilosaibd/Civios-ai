// Super Admin / Sub-Admin RBAC tests. Runs all real migrations in PGlite.
//   npm install --no-save @electric-sql/pglite && node --test supabase/tests/admin-rbac.test.mjs
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here,"security.test.mjs"),"utf8");
const STUBS = source.match(/const STUBS = `([\s\S]*?)`;/)[1];
const migrations = join(here,"..","migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const SUB = "00000000-0000-4000-8000-0000000000a2";
const OTHER = "00000000-0000-4000-8000-0000000000a3";
let db;

async function as(role,uid,email,fn){
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid ?? ""}',false);
    SELECT set_config('request.jwt.claims','${JSON.stringify(uid?{sub:uid,email}:{})}',false); SET ROLE ${role};`);
  try{return await fn();}finally{await db.exec("RESET ROLE");}
}
const admin=(fn)=>as("authenticated",ADMIN,"zobaerio24@gmail.com",fn);
const sub=(fn)=>as("authenticated",SUB,"subadmin@example.com",fn);
const other=(fn)=>as("authenticated",OTHER,"other@example.com",fn);
const q=async(sql,params)=> (await db.query(sql,params)).rows;
const rejects=(fn,re)=>assert.rejects(Promise.resolve().then(fn),re);

before(async()=>{
  db=new PGlite({extensions:{pgcrypto}});
  await db.exec(STUBS);
  for(const file of readdirSync(migrations).filter(f=>f.endsWith(".sql")).sort()){
    if(file==="20261030130000_super_admin_rbac_foundation.sql"){
      await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'zobaerio24@gmail.com',now())",[ADMIN]);
    }
    try{await db.exec(readFileSync(join(migrations,file),"utf8"));}
    catch(error){throw new Error(`migration ${file}: ${error.message}`);}
  }
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'subadmin@example.com',now()),($2,'other@example.com',now())",[SUB,OTHER]);
});

test("Super Admin invitation creation and revocation are atomic and audited",async()=>{
  const tokenHash="dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  let invitationId;
  await admin(async()=>{
    const [created]=await q("SELECT public.admin_create_invitation($1,$2,now()+interval '7 days') AS value",["new-subadmin@example.com",tokenHash]);
    invitationId=created.value.id;
    assert.equal(created.value.status,"pending");
    await db.query("SELECT public.admin_revoke_invitation($1)",[invitationId]);
  });
  assert.equal((await q("SELECT status FROM public.admin_invitations WHERE id=$1",[invitationId]))[0].status,"revoked");
  const actions=(await q("SELECT action FROM public.admin_rbac_audit WHERE metadata->>'invitation_id'=$1 ORDER BY created_at",[invitationId])).map(x=>x.action);
  assert.deepEqual(actions,["invite_created","invite_revoked"]);
});

test("Super Admin invitation acceptance creates only a sub-admin membership for the invited email",async()=>{
  await db.query("INSERT INTO public.admin_invitations(invited_email,invited_by,role,status,token_hash,expires_at) VALUES ('subadmin@example.com',$1,'sub_admin','pending','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now()+interval '7 days')",[ADMIN]);
  await sub(async()=>{
    const result=await db.query("SELECT public.admin_accept_invitation('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') AS value");
    assert.equal(result.rows[0].value.status,"active");
  });
  const [membership]=await q("SELECT role,status FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  assert.deepEqual(membership,{role:"sub_admin",status:"active"});
  assert.equal((await q("SELECT status FROM public.admin_invitations WHERE token_hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'"))[0].status,"accepted");
});

test("Super Admin can grant Users permissions and manage automatically implies view",async()=>{
  const [membership]=await q("SELECT id FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  await admin(async()=>{
    await db.query("SELECT public.admin_set_subadmin_permissions($1,ARRAY['manage']::text[])",[membership.id]);
  });
  const actions=(await q("SELECT action FROM public.admin_feature_permissions WHERE membership_id=$1 ORDER BY action",[membership.id])).map(x=>x.action);
  assert.deepEqual(actions,["manage","view"]);
  await sub(async()=>{
    assert.equal((await db.query("SELECT public.has_admin_permission('users','view') AS allowed")).rows[0].allowed,true);
    assert.equal((await db.query("SELECT public.has_admin_permission('users','manage') AS allowed")).rows[0].allowed,true);
  });
});

test("Super Admin can grant project permissions and project manage implies view",async()=>{
  const [membership]=await q("SELECT id FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  await admin(async()=>{ await db.query("SELECT public.admin_set_subadmin_project_permissions($1,ARRAY['manage']::text[])",[membership.id]); });
  const actions=(await q("SELECT action FROM public.admin_feature_permissions WHERE membership_id=$1 AND feature_key='projects' ORDER BY action",[membership.id])).map(x=>x.action);
  assert.deepEqual(actions,["manage","view"]);
  await sub(async()=>{
    assert.equal((await db.query("SELECT public.has_admin_permission('projects','view') AS allowed")).rows[0].allowed,true);
    assert.equal((await db.query("SELECT public.has_admin_permission('projects','manage') AS allowed")).rows[0].allowed,true);
  });
});

test("Sub-admin cannot grant permissions or manage other sub-admins",async()=>{
  const [membership]=await q("SELECT id FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  await sub(()=>rejects(()=>db.query("SELECT public.admin_set_subadmin_permissions($1,ARRAY['view']::text[])",[membership.id]),/Super Admin access required/));
  await other(()=>rejects(()=>db.query("SELECT public.admin_set_subadmin_status($1,'suspended')",[membership.id]),/Super Admin access required/));
});

test("Invalid permissions and duplicate permissions are rejected",async()=>{
  const [membership]=await q("SELECT id FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  await admin(()=>rejects(()=>db.query("SELECT public.admin_set_subadmin_permissions($1,ARRAY['delete']::text[])",[membership.id]),/Only users.view and users.manage/));
  await admin(()=>rejects(()=>db.query("SELECT public.admin_set_subadmin_permissions($1,ARRAY['view','view']::text[])",[membership.id]),/Duplicate permission actions/));
});

test("Suspending a sub-admin revokes permission checks; reactivation restores them",async()=>{
  const [membership]=await q("SELECT id FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  await admin(()=>db.query("SELECT public.admin_set_subadmin_status($1,'suspended')",[membership.id]));
  await sub(async()=>assert.equal((await db.query("SELECT public.has_admin_permission('users','view') AS allowed")).rows[0].allowed,false));
  await admin(()=>db.query("SELECT public.admin_set_subadmin_status($1,'active')",[membership.id]));
  await sub(async()=>assert.equal((await db.query("SELECT public.has_admin_permission('users','view') AS allowed")).rows[0].allowed,true));
});

test("Sub-admin removal deletes permissions and access",async()=>{
  const [membership]=await q("SELECT id FROM public.admin_memberships WHERE user_id=$1",[SUB]);
  await admin(()=>db.query("SELECT public.admin_remove_subadmin($1)",[membership.id]));
  assert.equal((await q("SELECT count(*)::int n FROM public.admin_feature_permissions WHERE membership_id=$1",[membership.id]))[0].n,0);
  await sub(async()=>assert.equal((await db.query("SELECT public.has_admin_permission('users','view') AS allowed")).rows[0].allowed,false));
});

test("Expired, mismatched and replayed invitations cannot activate access",async()=>{
  await db.query("INSERT INTO public.admin_invitations(invited_email,invited_by,role,status,token_hash,expires_at) VALUES ('someoneelse@example.com',$1,'sub_admin','pending','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',now()+interval '7 days'),('other@example.com',$1,'sub_admin','pending','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',now()-interval '1 day')",[ADMIN]);
  await other(()=>rejects(()=>db.query("SELECT public.admin_accept_invitation('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')"),/belongs to another email/));
  await other(()=>rejects(()=>db.query("SELECT public.admin_accept_invitation('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')"),/invalid, revoked, or expired/));
  await other(()=>rejects(()=>db.query("SELECT public.admin_accept_invitation('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')"),/invalid, revoked, or expired/));
});


test("Only Super Admin can create invitations; token hashes and audit rows are stored atomically",async()=>{
  const hash="dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  await sub(()=>rejects(()=>db.query("SELECT public.admin_create_invitation('new-admin@example.com',$1,now()+interval '7 days')",[hash]),/Super Admin access required/));
  await admin(async()=>{
    const result=await db.query("SELECT public.admin_create_invitation('new-admin@example.com',$1,now()+interval '7 days') AS invitation",[hash]);
    assert.equal(result.rows[0].invitation.invited_email,"new-admin@example.com");
    assert.equal(result.rows[0].invitation.status,"pending");
  });
  assert.equal((await q("SELECT count(*)::int n FROM public.admin_invitations WHERE token_hash=$1 AND status='pending'",[hash]))[0].n,1);
  assert.equal((await q("SELECT count(*)::int n FROM public.admin_rbac_audit WHERE action='invite_created' AND metadata->>'invited_email'='new-admin@example.com'"))[0].n,1);
});

test("Invitation replacement and revocation are audited and replay-safe",async()=>{
  const first="eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const second="ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  let id;
  await admin(async()=>{
    const created=await db.query("SELECT public.admin_create_invitation('replace@example.com',$1,now()+interval '7 days') AS invitation",[first]);
    id=created.rows[0].invitation.id;
    await db.query("SELECT public.admin_create_invitation('replace@example.com',$1,now()+interval '7 days')",[second]);
  });
  assert.equal((await q("SELECT status FROM public.admin_invitations WHERE id=$1",[id]))[0].status,"revoked");
  assert.equal((await q("SELECT count(*)::int n FROM public.admin_rbac_audit WHERE action='invite_revoked' AND metadata->>'reason'='replaced_by_new_invitation'"))[0].n,1);
  const [pending]=await q("SELECT id FROM public.admin_invitations WHERE token_hash=$1",[second]);
  await admin(async()=>{
    assert.equal((await db.query("SELECT public.admin_revoke_invitation($1) AS value",[pending.id])).rows[0].value,true);
    await rejects(()=>db.query("SELECT public.admin_revoke_invitation($1)",[pending.id]),/Pending invitation not found/);
  });
  assert.equal((await q("SELECT status FROM public.admin_invitations WHERE id=$1",[pending.id]))[0].status,"revoked");
});

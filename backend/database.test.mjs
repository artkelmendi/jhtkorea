import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('actual PostgreSQL migration caps administrators, denies browser roles and persists rate/session limits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);`);
    await db.exec(await readFile(new URL('../supabase/migrations/202610040001_security.sql',import.meta.url),'utf8'));
    const owner='11111111-1111-4111-8111-111111111111', second='22222222-2222-4222-8222-222222222222', third='33333333-3333-4333-8333-333333333333';
    await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,second,third]);
    await db.query('insert into jht_private.admin_slots(slot,user_id) values(1,$1),(2,$2)',[owner,second]);
    await assert.rejects(()=>db.query('insert into jht_private.admin_slots(slot,user_id) values(3,$1)',[third]));
    await assert.rejects(()=>db.query('insert into jht_private.admin_slots(slot,user_id) values(1,$1)',[third]));
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role};`);
      await assert.rejects(()=>db.query('select * from jht_private.admin_slots'));
      await assert.rejects(()=>db.query('select * from public.jht_vehicles'));
      await assert.rejects(()=>db.query('select public.jht_admin_slot($1)',[owner]));
      await assert.rejects(()=>db.query('select public.jht_session_get($1)',['a'.repeat(64)]));
      await db.exec('reset role;');
    }
    const limitKey='b'.repeat(64);
    for (let i=1;i<=6;i++) {
      const result=await db.query('select public.jht_rate_limit($1,5,900) allowed',[limitKey]);
      assert.equal(result.rows[0].allowed,i<=5);
    }
    const sessionHash='a'.repeat(64);
    await db.query(`select public.jht_session_put($1,$2,'encrypted',now()+interval '1 hour')`,[sessionHash,owner]);
    assert.equal((await db.query('select public.jht_session_get($1) s',[sessionHash])).rows[0].s.user_id,owner);
    await db.query(`update jht_private.sessions set last_seen=now()-interval '16 minutes' where id_hash=$1`,[sessionHash]);
    assert.equal((await db.query('select public.jht_session_get($1) s',[sessionHash])).rows[0].s,null);
    await assert.rejects(()=>db.query(`select public.jht_session_put($1,$2,'encrypted',now()+interval '1 hour')`,['c'.repeat(64),third]));
  } finally { await db.close(); }
});

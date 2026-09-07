import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration executes in PostgreSQL and enforces actual database permissions',async t=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(await readFile(new URL('../supabase/migrations/202609070001_private_racing.sql',import.meta.url),'utf8'));
    const id='00000000-0000-4000-8000-000000000001';
    await db.query('insert into public.pixel_racer_rooms (id,invite_hash,document) values ($1,$2,$3)',[id,'a'.repeat(64),{members:[]}]);
    await t.test('anonymous and authenticated clients cannot read or mutate either table or call the limiter',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select * from public.pixel_racer_rooms'),/permission denied/);
        await assert.rejects(db.query('update public.pixel_racer_rooms set version=99'),/permission denied/);
        await assert.rejects(db.query('select * from public.pixel_racer_limits'),/permission denied/);
        await assert.rejects(db.query("select public.pixel_racer_rate_limit('test',2,60)"),/permission denied/);
        await db.exec('reset role');
      }
    });
    await t.test('RLS still hides all rooms if table SELECT is accidentally granted later',async()=>{
      await db.exec('grant select on public.pixel_racer_rooms to anon; set role anon');
      assert.equal((await db.query('select * from public.pixel_racer_rooms')).rows.length,0);
      await db.exec('reset role; revoke select on public.pixel_racer_rooms from anon');
    });
    await t.test('backend service role can read and commit exactly one competing version',async()=>{
      await db.exec('set role service_role');
      assert.equal((await db.query('select * from public.pixel_racer_rooms')).rows.length,1);
      const updates=await Promise.all([1,2].map(()=>db.query('update public.pixel_racer_rooms set version=1 where id=$1 and version=0 returning version',[id])));
      assert.equal(updates.reduce((sum,r)=>sum+r.rows.length,0),1);
      await db.exec('reset role');
    });
    await t.test('persisted rate limiter permits the limit, rejects overflow and resets after expiry',async()=>{
      await db.exec('set role service_role');
      const check=async()=> (await db.query("select public.pixel_racer_rate_limit('test',2,60) as allowed")).rows[0].allowed;
      assert.equal(await check(),true);assert.equal(await check(),true);assert.equal(await check(),false);
      await db.exec("update public.pixel_racer_limits set expires_at = now() - interval '1 second'");
      assert.equal(await check(),true);
      await db.exec('reset role');
    });
  } finally {await db.close();}
});

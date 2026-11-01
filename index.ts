// Supabase Edge Function: memo-push  (中身なしのWeb Push。VAPID鍵は初回に自動生成して memo_vapid に保存)
import { createClient } from "npm:@supabase/supabase-js@2";

const SUBJECT = "mailto:you@example.com"; // ← ご自身のメールアドレスに変更してください(iPhone向け通知で必要)
const THROTTLE_MS = 10 * 60 * 1000;        // 同じ端末への通知は10分に1回まで(=「話し始め」だけ知らせる)

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function vapid() {
  const get = () => sb.from("memo_vapid").select("pub,priv").eq("id", 1).maybeSingle();
  const { data } = await get();
  if (data) return data as { pub: string; priv: JsonWebKey };
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  await sb.from("memo_vapid").upsert({ id: 1, pub, priv }, { onConflict: "id", ignoreDuplicates: true });
  return (await get()).data as { pub: string; priv: JsonWebKey };
}

async function jwt(aud: string, v: { priv: JsonWebKey }) {
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: "JWT", alg: "ES256" });
  const body = enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT });
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const v = await vapid();
    if (b.op === "key") return json({ pk: v.pub });
    if (b.op === "notify") {
      if (typeof b.room !== "string" || b.room.length !== 64) return json({ error: "bad request" }, 400);
      const { data: rows } = await sb.from("memo_push").select("dev,sub,notified_at").eq("room", b.room).neq("dev", String(b.dev ?? ""));
      let sent = 0;
      for (const r of rows ?? []) {
        if (r.notified_at && Date.now() - new Date(r.notified_at).getTime() < THROTTLE_MS) continue;
        const ep = r.sub.endpoint as string;
        const res = await fetch(ep, { method: "POST", headers: { Authorization: `vapid t=${await jwt(new URL(ep).origin, v)}, k=${v.pub}`, TTL: "3600", Urgency: "normal" } });
        if (res.status === 404 || res.status === 410) await sb.from("memo_push").delete().eq("room", b.room).eq("dev", r.dev);
        else if (res.ok) { sent++; await sb.from("memo_push").update({ notified_at: new Date().toISOString() }).eq("room", b.room).eq("dev", r.dev); }
      }
      return json({ sent });
    }
    return json({ error: "bad request" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

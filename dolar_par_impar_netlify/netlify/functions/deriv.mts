// 🔐 Ponte com o login novo da Deriv (developers.deriv.com · OAuth2 + PKCE).
// O navegador não pode trocar o código direto (a Deriv pede que seja feito no servidor), então esta função faz:
//   POST /api/deriv {acao:'token',  client_id, code, verifier, redirect}  → { access_token, refresh_token, expires_in }
//   POST /api/deriv {acao:'renova', client_id, refresh}                   → { access_token, refresh_token, expires_in }
//   POST /api/deriv {acao:'otp',    client_id, token}                     → { url, account_id, balance, currency }  (SÓ conta DEMO)
// Nada é gravado aqui: o token fica apenas no navegador de quem logou.
import type { Context, Config } from "@netlify/functions";

const AUTH = "https://auth.deriv.com/oauth2/token";
const API = "https://api.derivws.com/trading/v1/options";

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function lerJson(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { erro: t.slice(0, 400) }; }
}

async function token(corpo: Record<string, string>) {
  const r = await fetch(AUTH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(corpo).toString(),
  });
  const j = await lerJson(r);
  if (!r.ok || !j.access_token) return json({ erro: j.error_description || j.error || j.erro || `Deriv respondeu ${r.status}`, status: r.status }, r.ok ? 400 : r.status);
  return json({ access_token: j.access_token, refresh_token: j.refresh_token || "", expires_in: j.expires_in || 0 });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  const cid = String(b.client_id || "").trim();
  if (!cid) return json({ erro: "falta o App ID" }, 400);

  if (b.acao === "token") {
    if (!b.code || !b.verifier || !b.redirect) return json({ erro: "faltam dados do login" }, 400);
    return token({ grant_type: "authorization_code", client_id: cid, code: String(b.code), code_verifier: String(b.verifier), redirect_uri: String(b.redirect) });
  }
  if (b.acao === "renova") {
    if (!b.refresh) return json({ erro: "sem refresh token" }, 400);
    return token({ grant_type: "refresh_token", client_id: cid, refresh_token: String(b.refresh) });
  }
  if (b.acao === "otp") {
    const h = { authorization: `Bearer ${b.token}`, "deriv-app-id": cid, accept: "application/json" };
    const r = await fetch(`${API}/accounts`, { headers: h });
    const j = await lerJson(r);
    if (!r.ok) return json({ erro: j?.errors?.[0]?.message || j?.error?.message || j.erro || `contas: Deriv respondeu ${r.status}`, status: r.status }, r.status === 401 ? 401 : 400);
    const contas: any[] = Array.isArray(j.data) ? j.data : [];
    const demo = contas.find(c => String(c.account_type).toLowerCase() === "demo" && (!c.status || c.status === "active"))
      || contas.find(c => String(c.account_type).toLowerCase() === "demo");
    if (!demo) return json({ erro: "essa conta Deriv não tem conta DEMO (só real) — nada será feito", tipos: contas.map(c => c.account_type) }, 400);
    const o = await fetch(`${API}/accounts/${encodeURIComponent(demo.account_id)}/otp`, { method: "POST", headers: h });
    const oj = await lerJson(o);
    const url = oj?.data?.url || "";
    if (!o.ok || !url) return json({ erro: oj?.errors?.[0]?.message || oj?.error?.message || oj.erro || `otp: Deriv respondeu ${o.status}` }, o.status === 401 ? 401 : 400);
    if (!/\/ws\/demo/.test(url)) return json({ erro: "a Deriv devolveu um endereço que não é DEMO — bloqueado" }, 400);
    return json({ url, account_id: demo.account_id, balance: demo.balance, currency: demo.currency || "USD" });
  }
  return json({ erro: "ação desconhecida" }, 400);
};

export const config: Config = { path: "/api/deriv" };

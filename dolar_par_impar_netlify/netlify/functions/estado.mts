// ☁ Banco da nuvem do "Dólar Par/Ímpar": guarda robôs, relatórios, banca e configurações.
// GET  /api/estado?meta=1  → { ts, bytes }   (só a data da última gravação)
// GET  /api/estado         → estado completo (JSON compactado em gzip)
// PUT  /api/estado?ts=...  → grava o estado (corpo em gzip)
// Todas as chamadas exigem o cabeçalho x-senha igual à variável de ambiente SYNC_SENHA.
import { getStore, getDeployStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

const LIMITE = 5.5 * 1024 * 1024; // funções aceitam até ~6 MB por pedido

function loja() {
  // produção usa o banco global; prévias de deploy ficam num banco separado para não misturar
  if (Netlify.context?.deploy?.context === "production") return getStore({ name: "dolar-par-impar", consistency: "strong" });
  return getDeployStore("dolar-par-impar");
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default async (req: Request, context: Context) => {
  const senha = Netlify.env.get("SYNC_SENHA");
  if (!senha) return new Response("Configure a variável SYNC_SENHA na Netlify (Project configuration > Environment variables).", { status: 500 });
  if (!iguais(req.headers.get("x-senha") || "", senha)) return new Response("senha errada", { status: 401 });

  const store = loja();
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("meta")) {
      const meta = await store.get("meta", { type: "json" });
      if (!meta) return new Response("vazio", { status: 404 });
      return Response.json(meta, { headers: { "cache-control": "no-store" } });
    }
    const dados = await store.get("estado", { type: "arrayBuffer" });
    if (!dados) return new Response("vazio", { status: 404 });
    return new Response(dados, { headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } });
  }

  if (req.method === "PUT") {
    const corpo = await req.arrayBuffer();
    if (!corpo.byteLength) return new Response("corpo vazio", { status: 400 });
    if (corpo.byteLength > LIMITE) return new Response("dados grandes demais para a nuvem (limite ~5,5 MB compactado)", { status: 413 });
    // guarda a versão anterior como cópia de segurança
    const antigo = await store.get("estado", { type: "arrayBuffer" });
    if (antigo) await store.set("estado-anterior", antigo);
    const ts = Math.max(Date.now(), Number(url.searchParams.get("ts")) || 0);
    await store.set("estado", corpo);
    await store.setJSON("meta", { ts, bytes: corpo.byteLength });
    return Response.json({ ok: true, ts });
  }

  return new Response("método não suportado", { status: 405 });
};

export const config: Config = {
  path: "/api/estado",
};

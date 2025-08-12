// functions/api/[[path]].ts

export async function onRequest(context: {
  request: Request;
  env: {
    API_BASE_URL: string; // 環境変数からAPIのベースURLを取得
  };
}): Promise<Response> {
  // console.log("onRequest called with context:", context);
  const { request, env } = context;
  // console.log("Request path:", request.url);
  const origin = env.API_BASE_URL;
  const url = new URL(request.url);

  // /api/ 以降のパスを抜き出し
  // 例: https://example.com/api/users/list -> /users/list
  // const apiPath = url.pathname.replace(/^\/api/, "") || "/";
  const apiPath = url.pathname;

  // 元のクエリはそのまま
  const target = new URL(origin + apiPath + url.search);

  // 元リクエストをほぼそのまま転送（ヘッダ調整含む）
  const init: RequestInit = {
    method: request.method,
    headers: buildForwardHeaders(request.headers),
    body: needsBody(request.method) ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  };

  try {
    // console.log("Forwarding request to:", target.toString());
    const upstreamResp = await fetch(target.toString(), init);

    // 必要に応じてヘッダ加工（CORS不要なら極力そのまま）
    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: filterResponseHeaders(upstreamResp.headers),
    });
  } catch (e) {
    // console.error("Error during fetch:", e);
    // 障害時のフォールバック
    return new Response(
      JSON.stringify({ error: "Upstream fetch failed", detail: String(e) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

function needsBody(method: string) {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

function buildForwardHeaders(incoming: Headers) {
  const headers = new Headers(incoming);

  // Cloudflare / ブラウザ固有で不要・危険なものを間引く例
  const hopByHop = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "cf-ray",
    "cf-connecting-ip",
  ];
  hopByHop.forEach(h => headers.delete(h));

  // Host をオリジン側に合わせたい場合（多くは不要）
  // headers.set("Host", new URL(ORIGIN).host);

  return headers;
}

function filterResponseHeaders(up: Headers) {
  const h = new Headers(up);
  // Cloudflare が自動で付ける or 不要なヘッダを除外したい場合
  ["content-security-policy", "x-powered-by"].forEach(x => {
    // 必要に応じて削除
    // h.delete(x);
  });

  // ここでカスタムCORSを付けたい場合（通常は不要）
  // h.set("Access-Control-Allow-Origin", "https://yourdomain.com");

  return h;
}


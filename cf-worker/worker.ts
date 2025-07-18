export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // プロキシ対象のパス
    if (url.pathname.startsWith("/api/")) {
      // バックエンドAPIのURLへプロキシ
      const proxyUrl = `https://api.example.com${url.pathname}`;
      return fetch(proxyUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.blob() : undefined,
      });
    }

    // 静的ファイルを返す（assetsから）
    return env.ASSETS.fetch(request);
  },
};

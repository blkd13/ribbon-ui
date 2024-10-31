const PROXY_CONFIG = {
    // mattermostはcookieにアクセストークンをセットするだけで良いので直接mattermostサーバーに向ける
    "/api/user/oauth/api/proxy/mattermost/api/v4/": {
        target: "https://mattermost.com",
        secure: false,
        changeOrigin: true,
        ws: true,
        pathRewrite: {
            "^/api/user/oauth/api/proxy/mattermost/api/v4/": "/api/v4/"
        }
    },
    "/api": {
        target: "http://localhost:3000",
        secure: false,
        changeOrigin: true,
        ws: true
    },
}

module.exports = PROXY_CONFIG;

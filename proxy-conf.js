const PROXY_CONFIG = {
    "/api": {
        target: "http://localhost:3010",
        secure: false,
    },
}

module.exports = PROXY_CONFIG;

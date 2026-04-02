const express = require("express");
const path = require("path");
const { generateFullConfig } = require("./lib/generator");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public")));

/**
 * POST /api/generate
 * Takes full config JSON, returns haproxy.cfg text + map files
 */
app.post("/api/generate", (req, res) => {
    try {
        const config = req.body;
        if (!config || Object.keys(config).length === 0) {
            return res.status(400).json({ error: "Configuration data is required" });
        }
        const result = generateFullConfig(config);
        return res.json(result);
    } catch (err) {
        console.error("Generation error:", err);
        return res.status(500).json({ error: "Error generating config: " + err.message });
    }
});

/**
 * GET /api/sample
 * Returns a sample config JSON for the UI to populate
 */
app.get("/api/sample", (req, res) => {
    const sample = {
        clusterName: "L7-Haproxy",
        global: {
            pidfile: "/home/offloader/logs/haproxy.pid",
            sslPassphraseFile: "/tempfs/cert.pass",
            user: "offloader",
            group: "offloader",
            daemon: true,
            nbthread: 16,
            sslCacheSize: 200000,
            sslLifetime: 7200,
            statsSocket: {
                path: "/home/offloader/logs/haproxy.sock",
                mode: "600",
                level: "admin",
                exposeFdListeners: true
            },
            maxconn: 60000,
            log: { target: "/var/run/log", facility: "local0" },
            sslDefaultBindCiphersuites: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
            healthVar: "health"
        },
        defaults: {
            mode: "http",
            logGlobal: true,
            timeoutClient: "20s",
            timeoutServer: "900s",
            timeoutHttpRequest: "20s",
            timeoutConnect: "10s",
            forwardFor: "LB_SSL_REMOTE_IP",
            compression: {
                algo: "gzip",
                types: "text/plain text/css application/javascript text/javascript application/json application/x-javascript text/xml application/xml"
            },
            logFormat: "[%t] %ci:%cp %{+Q}[var(txn.host)] %HP %HV %ST %B %Tt %{+Q}[var(req.req_id)] %Tc %Tr %tsc %{+Q}[var(txn.req_base)] %{+Q}[var(txn.backend)] ug:%b ua:%s %sslc %sslv %[ssl_fc_is_resumed] %hrl"
        },
        httpErrors: {
            name: "errorpage",
            files: [
                { statusCode: 500, filePath: "/home/offloader/haproxy/pages/500.html" },
                { statusCode: 502, filePath: "/home/offloader/haproxy/pages/502.html" },
                { statusCode: 503, filePath: "/home/offloader/haproxy/pages/503.html" },
                { statusCode: 504, filePath: "/home/offloader/haproxy/pages/504.html" }
            ]
        },
        frontends: [
            {
                name: "http80-https443",
                binds: [
                    { port: 80 },
                    {
                        port: 443, ssl: true, alpn: "http/1.1",
                        defaultCrt: "/home/offloader/haproxy/cert/Wild-zohogac-LE",
                        crtDir: "/home/offloader/haproxy/cert/",
                        tlsTicketKeys: "/tempfs/L7-Haproxy.keys",
                        sslMinVer: "TLSv1.2",
                        ciphers: "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384"
                    }
                ],
                httpToHttpsRedirect: true,
                monitorUri: "/grid/login/servercheck.jsp",
                healthStatusMap: "/home/offloader/logs/health_status.map",
                errorfilesRef: "errorpage",
                ipAccessControl: { allowedIps: ["172.20.65.44"] },
                wafRules: [
                    {
                        id: "3905173",
                        domains: ["cliq.zoho.com", "chat.zoho.com"],
                        simulation: { enabled: true, srcIp: "172.20.133.235" },
                        block: { enabled: true, excludeDomains: ["www-detran-parana-gov-br.zohosites.com"] },
                        testing: { enabled: true, path: "path" }
                    }
                ],
                domainPathRoutes: [
                    {
                        id: "7268119",
                        domains: ["cliq.zoho.com", "chat.zoho.com"],
                        pathPattern: "(.*/)?(_wms)",
                        pathType: "regex",
                        redirections: [
                            { type: "cookie", name: "cookie1", matchType: "str", value: "c1", backend: "L7-3667005.https" },
                            { type: "query", name: "query1", matchType: "str", value: "q1", backend: "L7-3667005.https" },
                            { type: "header", name: "header1", matchType: "str", value: "h1", backend: "L7-3667005.https" }
                        ]
                    }
                ],
                mapEntries: [
                    { pattern: "^cliq.zoho.com/", backend: "L7-3667005.https" }
                ],
                defaultMapEntries: [
                    { pattern: "^cliq.zoho.com/", backend: "L7-3667005.https" }
                ],
                rateLimiting: {
                    implicit: {
                        enabled: true,
                        entries: [
                            { pattern: "^cliq\\.zoho\\.com$", rate: 50000, mode: 0 }
                        ]
                    },
                    explicit: {
                        rules: [
                            {
                                id: "15302207", type: "host", mode: "enforce",
                                domains: ["cliq.zoho.com", "chat.zoho.com"],
                                limit: 1000
                            }
                        ]
                    },
                    cluster: { rate: 600000, dryrun: false }
                }
            }
        ],
        backends: [
            {
                name: "L7-3667005.https",
                comment: "L7-ACME.https",
                balance: "roundrobin",
                dynamicCookieKey: "zalb_da92f5dc8f",
                healthCheck: { method: "GET", path: "/grid/login/servercheck.jsp", expectStatus: 400 },
                defaultServer: { check: true, inter: "10s", rise: 2, fall: 2 },
                servers: [{ name: "172.20.13.157:80", address: "172.20.13.157:80" }]
            }
        ],
        rateLimitTables: [
            {
                name: "st_ratelimit_host",
                stickTable: { type: "string", len: 256, size: "200k", expire: "1m", store: "http_req_rate(1m)" }
            },
            {
                name: "st_explicit_rl",
                stickTable: { type: "string", len: 256, size: "96m", expire: "1m", store: "http_req_rate(1m)" }
            }
        ],
        stats: {
            enabled: true,
            port: 8079,
            refresh: "10s",
            uri: "/stats",
            showModules: true
        }
    };
    res.json(sample);
});

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
    console.log(`HAProxy Config Generator running on http://localhost:${PORT}`);
});
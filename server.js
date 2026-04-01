const express = require("express");
const app = express();
const PORT = 3000;

// Middleware to parse JSON
app.use(express.json());

/**
 * POST /generate
 * Input: { domain, path, backend }
 * Output: { config }
 */
app.post("/generate", (req, res) => {
    const { domain, path, backend } = req.body;

    // Basic validation
    if (!domain || !path || !backend) {
        return res.status(400).json({
            error: "domain, path, and backend are required"
        });
    }

    try {
        const config = generateConfig(domain, path, backend);
        return res.json({ config });
    } catch (err) {
        return res.status(500).json({
            error: "Error generating config"
        });
    }
});

/**
 * Function to generate HAProxy config
 */
function generateConfig(domain, path, backend) {
    // TODO: Improve this logic
    return `
frontend http_front
    bind *:80
    acl host_${sanitize(domain)} hdr(host) -i ${domain}
    use_backend ${sanitize(domain)}_backend if host_${sanitize(domain)}

backend ${sanitize(domain)}_backend
    server server1 ${backend}
`;
}

/**
 * Helper to sanitize names (basic)
 */
function sanitize(input) {
    return input.replace(/[^a-zA-Z0-9]/g, "_");
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
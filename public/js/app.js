/* ═══════════════════════════════════════════════════════════════════════════
   HAProxy Config Generator - Frontend Application Logic
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────────────────

let state = {
    frontends: [],
    backends: [],
    errorPages: [
        { statusCode: 500, filePath: '/home/offloader/haproxy/pages/500.html' },
        { statusCode: 502, filePath: '/home/offloader/haproxy/pages/502.html' },
        { statusCode: 503, filePath: '/home/offloader/haproxy/pages/503.html' },
        { statusCode: 504, filePath: '/home/offloader/haproxy/pages/504.html' }
    ],
    rateLimitTables: [
        { name: 'st_ratelimit_host', type: 'string', len: 256, size: '200k', expire: '1m', store: 'http_req_rate(1m)' },
        { name: 'st_explicit_rl', type: 'string', len: 256, size: '96m', expire: '1m', store: 'http_req_rate(1m)' }
    ],
    generatedConfig: null,
    generatedMapFiles: null
};

let idCounter = 1000;
function nextId() { return idCounter++; }

// ─── Navigation ──────────────────────────────────────────────────────────────

const sectionTitles = {
    global: 'Global Settings',
    defaults: 'Defaults',
    errorpages: 'Error Pages',
    frontends: 'Frontends',
    backends: 'Backends',
    ratelimit: 'Rate Limit Tables',
    stats: 'Stats Dashboard',
    mapfiles: 'Map Files',
    preview: 'Preview & Export'
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        switchSection(section);
    });
});

function switchSection(section) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');
    document.querySelectorAll('.config-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${section}`).classList.add('active');
    document.getElementById('sectionTitle').textContent = sectionTitles[section] || section;
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}

// ─── Error Pages ─────────────────────────────────────────────────────────────

function renderErrorPages() {
    const container = document.getElementById('errorPagesList');
    container.innerHTML = '';
    state.errorPages.forEach((ep, idx) => {
        container.innerHTML += `
            <div class="inline-item">
                <span class="inline-item-label">Code</span>
                <input type="number" value="${ep.statusCode}" onchange="state.errorPages[${idx}].statusCode=parseInt(this.value)" style="max-width:80px">
                <span class="inline-item-label">Path</span>
                <input type="text" value="${ep.filePath}" onchange="state.errorPages[${idx}].filePath=this.value">
                <button class="btn-ghost" onclick="state.errorPages.splice(${idx},1);renderErrorPages()"><i class="fas fa-trash"></i></button>
            </div>`;
    });
}

function addErrorPage() {
    state.errorPages.push({ statusCode: 500, filePath: '/home/offloader/haproxy/pages/500.html' });
    renderErrorPages();
}

// ─── Frontends ───────────────────────────────────────────────────────────────

function addFrontend() {
    const id = nextId();
    state.frontends.push({
        _id: id,
        name: `http80-https443`,
        binds: [
            { port: 80, ssl: false },
            { port: 443, ssl: true, alpn: 'http/1.1', defaultCrt: '/home/offloader/haproxy/cert/Wild-zohogac-LE', crtDir: '/home/offloader/haproxy/cert/', tlsTicketKeys: '/tempfs/L7-Haproxy.keys', sslMinVer: 'TLSv1.2', ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305:EECDH+aRSA+AES+SHA256:EECDH+aRSA+AES+SHA384:EECDH+aRSA+AES128+SHA:EECDH+aRSA+AES256+SHA:!aNULL:!eNULL:!LOW:!MD5:!EXP:!PSK:!SRP:!DSS:!3DES' }
        ],
        httpToHttpsRedirect: true,
        monitorUri: '/grid/login/servercheck.jsp',
        healthStatusMap: '/home/offloader/logs/health_status.map',
        errorfilesRef: 'errorpage',
        ipAccessControl: { allowedIps: ['172.20.65.44'] },
        wafRules: [],
        domainPathRoutes: [],
        mapEntries: [],
        defaultMapEntries: [],
        rateLimiting: {
            implicit: { enabled: true, entries: [] },
            explicit: { rules: [] },
            cluster: { rate: 600000, dryrun: false }
        }
    });
    renderFrontends();
    showToast('Frontend added', 'success');
}

function removeFrontend(id) {
    state.frontends = state.frontends.filter(f => f._id !== id);
    renderFrontends();
    showToast('Frontend removed', 'info');
}

function renderFrontends() {
    const container = document.getElementById('frontendsList');
    if (state.frontends.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-door-open"></i><p>No frontends configured. Click "Add Frontend" to start.</p></div>`;
        return;
    }
    container.innerHTML = state.frontends.map((fe, fi) => renderFrontendItem(fe, fi)).join('');
    // init tab behavior
    state.frontends.forEach((fe) => {
        initFeTabs(fe._id);
    });
}

function renderFrontendItem(fe, fi) {
    const id = fe._id;
    return `
    <div class="dynamic-item" id="fe-${id}">
        <div class="dynamic-item-header" onclick="toggleCollapse('fe-${id}')">
            <div class="dynamic-item-title">
                <i class="fas fa-chevron-down chevron"></i>
                <i class="fas fa-door-open" style="color:var(--accent)"></i>
                <span>${fe.name || 'Frontend'}</span>
                <span class="badge">${fe.binds.map(b => ':' + b.port).join(' / ')}</span>
            </div>
            <div class="dynamic-item-actions">
                <button class="btn btn-xs btn-outline" onclick="event.stopPropagation();duplicateFrontend(${id})"><i class="fas fa-copy"></i></button>
                <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();removeFrontend(${id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="dynamic-item-body">
            <!-- Frontend Name -->
            <div class="form-grid cols-2 mb-2">
                <div class="form-group">
                    <label>Frontend Name</label>
                    <input type="text" value="${fe.name}" onchange="getFe(${id}).name=this.value;renderFrontends()">
                </div>
                <div class="form-group">
                    <label>Errorfiles Reference</label>
                    <input type="text" value="${fe.errorfilesRef || ''}" onchange="getFe(${id}).errorfilesRef=this.value">
                </div>
            </div>

            <!-- Tabs -->
            <div class="fe-tabs" id="fe-tabs-${id}">
                <button class="fe-tab active" data-tab="binds-${id}">Binds & SSL</button>
                <button class="fe-tab" data-tab="general-${id}">General</button>
                <button class="fe-tab" data-tab="waf-${id}">WAF Rules</button>
                <button class="fe-tab" data-tab="routes-${id}">Domain+Path Routes</button>
                <button class="fe-tab" data-tab="maps-${id}">Map Entries</button>
                <button class="fe-tab" data-tab="rl-${id}">Rate Limiting</button>
            </div>

            <!-- TAB: Binds & SSL -->
            <div class="fe-tab-content active" id="tab-binds-${id}">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm text-muted">Bind ports and SSL configuration</span>
                    <button class="btn btn-xs btn-accent" onclick="addBind(${id})"><i class="fas fa-plus"></i> Add Bind</button>
                </div>
                ${fe.binds.map((b, bi) => renderBind(id, b, bi)).join('')}
            </div>

            <!-- TAB: General -->
            <div class="fe-tab-content" id="tab-general-${id}">
                <div class="form-grid cols-2">
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" ${fe.httpToHttpsRedirect ? 'checked' : ''} onchange="getFe(${id}).httpToHttpsRedirect=this.checked"> HTTP to HTTPS Redirect
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Monitor URI</label>
                        <input type="text" value="${fe.monitorUri || ''}" onchange="getFe(${id}).monitorUri=this.value">
                    </div>
                    <div class="form-group">
                        <label>Health Status Map Path</label>
                        <input type="text" value="${fe.healthStatusMap || ''}" onchange="getFe(${id}).healthStatusMap=this.value">
                    </div>
                    <div class="form-group">
                        <label>Allowed Source IPs (comma-separated)</label>
                        <input type="text" value="${(fe.ipAccessControl?.allowedIps || []).join(', ')}" onchange="getFe(${id}).ipAccessControl={allowedIps:this.value.split(',').map(s=>s.trim()).filter(Boolean)}">
                    </div>
                </div>

                <!-- Custom Response Headers -->
                <div class="sub-section mt-2">
                    <div class="sub-section-header">
                        <span>Custom Response Headers</span>
                        <button class="btn btn-xs btn-accent" onclick="addResponseHeader(${id})"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="sub-section-body" id="fe-resp-headers-${id}">
                        ${(fe.responseHeaders || []).map((h, hi) => `
                            <div class="inline-item">
                                <span class="inline-item-label">Name</span>
                                <input type="text" value="${h.name}" onchange="getFe(${id}).responseHeaders[${hi}].name=this.value">
                                <span class="inline-item-label">Value</span>
                                <input type="text" value="${escapeHtml(h.value)}" onchange="getFe(${id}).responseHeaders[${hi}].value=this.value">
                                <button class="btn-ghost" onclick="getFe(${id}).responseHeaders.splice(${hi},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                            </div>
                        `).join('') || '<span class="text-sm text-muted">Default headers (ZALB_REQUEST_ID, HSTS) will be used</span>'}
                    </div>
                </div>
            </div>

            <!-- TAB: WAF Rules -->
            <div class="fe-tab-content" id="tab-waf-${id}">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm text-muted">WAF ACL rules - simulation, blocking, testing</span>
                    <button class="btn btn-xs btn-accent" onclick="addWafRule(${id})"><i class="fas fa-plus"></i> Add WAF Rule</button>
                </div>
                ${fe.wafRules.map((w, wi) => renderWafRule(id, w, wi)).join('') || '<div class="empty-state"><i class="fas fa-shield-alt"></i><p>No WAF rules. Click "Add WAF Rule" to add one.</p></div>'}
            </div>

            <!-- TAB: Domain+Path Routes -->
            <div class="fe-tab-content" id="tab-routes-${id}">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm text-muted">Domain+Path ACL routing with cookie/query/header redirections</span>
                    <button class="btn btn-xs btn-accent" onclick="addDomainPathRoute(${id})"><i class="fas fa-plus"></i> Add Route</button>
                </div>
                ${fe.domainPathRoutes.map((r, ri) => renderDomainPathRoute(id, r, ri)).join('') || '<div class="empty-state"><i class="fas fa-route"></i><p>No domain+path routes. Click "Add Route" to add one.</p></div>'}
            </div>

            <!-- TAB: Map Entries -->
            <div class="fe-tab-content" id="tab-maps-${id}">
                <div class="form-grid cols-1">
                    <div class="sub-section">
                        <div class="sub-section-header">
                            <span>Primary Map Entries (domain+path → backend)</span>
                            <button class="btn btn-xs btn-accent" onclick="addMapEntry(${id},'mapEntries')"><i class="fas fa-plus"></i></button>
                        </div>
                        <div class="sub-section-body">
                            ${fe.mapEntries.map((me, mi) => `
                                <div class="inline-item">
                                    <span class="inline-item-label">Pattern</span>
                                    <input type="text" value="${escapeHtml(me.pattern)}" onchange="getFe(${id}).mapEntries[${mi}].pattern=this.value" placeholder="^domain.com/path">
                                    <span class="inline-item-label">Backend</span>
                                    <input type="text" value="${me.backend}" onchange="getFe(${id}).mapEntries[${mi}].backend=this.value" placeholder="L7-xxx.https">
                                    <button class="btn-ghost" onclick="getFe(${id}).mapEntries.splice(${mi},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                                </div>
                            `).join('') || '<span class="text-sm text-muted">No primary map entries</span>'}
                        </div>
                    </div>
                    <div class="sub-section">
                        <div class="sub-section-header">
                            <span>Default Map Entries (fallback)</span>
                            <button class="btn btn-xs btn-accent" onclick="addMapEntry(${id},'defaultMapEntries')"><i class="fas fa-plus"></i></button>
                        </div>
                        <div class="sub-section-body">
                            ${fe.defaultMapEntries.map((me, mi) => `
                                <div class="inline-item">
                                    <span class="inline-item-label">Pattern</span>
                                    <input type="text" value="${escapeHtml(me.pattern)}" onchange="getFe(${id}).defaultMapEntries[${mi}].pattern=this.value" placeholder="^domain.com/">
                                    <span class="inline-item-label">Backend</span>
                                    <input type="text" value="${me.backend}" onchange="getFe(${id}).defaultMapEntries[${mi}].backend=this.value" placeholder="L7-xxx.https">
                                    <button class="btn-ghost" onclick="getFe(${id}).defaultMapEntries.splice(${mi},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                                </div>
                            `).join('') || '<span class="text-sm text-muted">No default map entries</span>'}
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB: Rate Limiting -->
            <div class="fe-tab-content" id="tab-rl-${id}">
                ${renderRateLimiting(id, fe.rateLimiting)}
            </div>
        </div>
    </div>`;
}

function renderBind(feId, bind, bi) {
    return `
    <div class="sub-section mb-1">
        <div class="sub-section-header">
            <span>Bind :${bind.port} ${bind.ssl ? '(SSL)' : '(Plain)'}</span>
            <button class="btn-ghost" onclick="getFe(${feId}).binds.splice(${bi},1);renderFrontends()"><i class="fas fa-trash"></i></button>
        </div>
        <div class="sub-section-body">
            <div class="form-grid cols-3">
                <div class="form-group">
                    <label>Port</label>
                    <input type="number" value="${bind.port}" onchange="getFe(${feId}).binds[${bi}].port=parseInt(this.value);renderFrontends()">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" ${bind.ssl ? 'checked' : ''} onchange="getFe(${feId}).binds[${bi}].ssl=this.checked;renderFrontends()"> Enable SSL
                    </label>
                </div>
                <div class="form-group">
                    <label>ALPN</label>
                    <input type="text" value="${bind.alpn || ''}" onchange="getFe(${feId}).binds[${bi}].alpn=this.value" ${!bind.ssl ? 'disabled' : ''}>
                </div>
                ${bind.ssl ? `
                <div class="form-group">
                    <label>Default Certificate</label>
                    <input type="text" value="${bind.defaultCrt || ''}" onchange="getFe(${feId}).binds[${bi}].defaultCrt=this.value">
                </div>
                <div class="form-group">
                    <label>Certificate Directory</label>
                    <input type="text" value="${bind.crtDir || ''}" onchange="getFe(${feId}).binds[${bi}].crtDir=this.value">
                </div>
                <div class="form-group">
                    <label>TLS Ticket Keys</label>
                    <input type="text" value="${bind.tlsTicketKeys || ''}" onchange="getFe(${feId}).binds[${bi}].tlsTicketKeys=this.value">
                </div>
                <div class="form-group">
                    <label>SSL Min Version</label>
                    <select onchange="getFe(${feId}).binds[${bi}].sslMinVer=this.value">
                        <option value="TLSv1.2" ${bind.sslMinVer === 'TLSv1.2' ? 'selected' : ''}>TLSv1.2</option>
                        <option value="TLSv1.3" ${bind.sslMinVer === 'TLSv1.3' ? 'selected' : ''}>TLSv1.3</option>
                    </select>
                </div>
                <div class="form-group full-width">
                    <label>Ciphers</label>
                    <input type="text" value="${bind.ciphers || ''}" onchange="getFe(${feId}).binds[${bi}].ciphers=this.value">
                </div>
                ` : ''}
            </div>
        </div>
    </div>`;
}

function renderWafRule(feId, waf, wi) {
    return `
    <div class="sub-section mb-1">
        <div class="sub-section-header">
            <span>WAF Rule #${waf.id}</span>
            <button class="btn-ghost" onclick="getFe(${feId}).wafRules.splice(${wi},1);renderFrontends()"><i class="fas fa-trash"></i></button>
        </div>
        <div class="sub-section-body">
            <div class="form-grid cols-2">
                <div class="form-group">
                    <label>Rule ID</label>
                    <input type="text" value="${waf.id}" onchange="getFe(${feId}).wafRules[${wi}].id=this.value">
                </div>
                <div class="form-group">
                    <label>Domains (comma-separated)</label>
                    <input type="text" value="${waf.domains.join(', ')}" onchange="getFe(${feId}).wafRules[${wi}].domains=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
                </div>
            </div>
            <div class="form-grid cols-3 mt-2">
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" ${waf.simulation?.enabled ? 'checked' : ''} onchange="ensureObj(getFe(${feId}).wafRules[${wi}],'simulation');getFe(${feId}).wafRules[${wi}].simulation.enabled=this.checked;renderFrontends()"> Simulation Mode
                    </label>
                    ${waf.simulation?.enabled ? `<input type="text" value="${waf.simulation.srcIp || ''}" placeholder="Simulation Source IP" onchange="getFe(${feId}).wafRules[${wi}].simulation.srcIp=this.value" class="mt-1">` : ''}
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" ${waf.block?.enabled ? 'checked' : ''} onchange="ensureObj(getFe(${feId}).wafRules[${wi}],'block');getFe(${feId}).wafRules[${wi}].block.enabled=this.checked;renderFrontends()"> Block Mode
                    </label>
                    ${waf.block?.enabled ? `<input type="text" value="${(waf.block.excludeDomains || []).join(', ')}" placeholder="Exclude domains (comma-sep)" onchange="getFe(${feId}).wafRules[${wi}].block.excludeDomains=this.value.split(',').map(s=>s.trim()).filter(Boolean)" class="mt-1">` : ''}
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" ${waf.testing?.enabled ? 'checked' : ''} onchange="ensureObj(getFe(${feId}).wafRules[${wi}],'testing');getFe(${feId}).wafRules[${wi}].testing.enabled=this.checked;renderFrontends()"> Testing Mode
                    </label>
                    ${waf.testing?.enabled ? `<input type="text" value="${waf.testing.path || ''}" placeholder="Test path" onchange="getFe(${feId}).wafRules[${wi}].testing.path=this.value" class="mt-1">` : ''}
                </div>
            </div>
        </div>
    </div>`;
}

function renderDomainPathRoute(feId, route, ri) {
    return `
    <div class="sub-section mb-1">
        <div class="sub-section-header">
            <span>Route #${route.id} — ${route.domains.join(', ')} / ${route.pathPattern || '/'}</span>
            <button class="btn-ghost" onclick="getFe(${feId}).domainPathRoutes.splice(${ri},1);renderFrontends()"><i class="fas fa-trash"></i></button>
        </div>
        <div class="sub-section-body">
            <div class="form-grid cols-3">
                <div class="form-group">
                    <label>Route ID</label>
                    <input type="text" value="${route.id}" onchange="getFe(${feId}).domainPathRoutes[${ri}].id=this.value">
                </div>
                <div class="form-group">
                    <label>Path Type</label>
                    <select onchange="getFe(${feId}).domainPathRoutes[${ri}].pathType=this.value">
                        <option value="regex" ${route.pathType === 'regex' ? 'selected' : ''}>Regex</option>
                        <option value="starts" ${route.pathType === 'starts' ? 'selected' : ''}>Starts With</option>
                        <option value="root" ${route.pathType === 'root' ? 'selected' : ''}>Root (/)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Path Pattern</label>
                    <input type="text" value="${escapeHtml(route.pathPattern || '')}" onchange="getFe(${feId}).domainPathRoutes[${ri}].pathPattern=this.value" placeholder="e.g. (.*/)?(_wms)">
                </div>
                <div class="form-group full-width">
                    <label>Domains (comma-separated)</label>
                    <input type="text" value="${route.domains.join(', ')}" onchange="getFe(${feId}).domainPathRoutes[${ri}].domains=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
                </div>
            </div>

            <!-- Redirections -->
            <div class="sub-section mt-2">
                <div class="sub-section-header">
                    <span>Redirections (Cookie / Query / Header)</span>
                    <button class="btn btn-xs btn-accent" onclick="addRedirection(${feId},${ri})"><i class="fas fa-plus"></i></button>
                </div>
                <div class="sub-section-body">
                    ${(route.redirections || []).map((redir, rri) => `
                        <div class="inline-item">
                            <select onchange="getFe(${feId}).domainPathRoutes[${ri}].redirections[${rri}].type=this.value;renderFrontends()" style="max-width:100px">
                                <option value="cookie" ${redir.type === 'cookie' ? 'selected' : ''}>Cookie</option>
                                <option value="query" ${redir.type === 'query' ? 'selected' : ''}>Query</option>
                                <option value="header" ${redir.type === 'header' ? 'selected' : ''}>Header</option>
                            </select>
                            <input type="text" value="${redir.name}" placeholder="Name" onchange="getFe(${feId}).domainPathRoutes[${ri}].redirections[${rri}].name=this.value" style="max-width:120px">
                            <select onchange="getFe(${feId}).domainPathRoutes[${ri}].redirections[${rri}].matchType=this.value" style="max-width:110px">
                                <option value="str" ${redir.matchType === 'str' ? 'selected' : ''}>Exact (str)</option>
                                <option value="reg" ${redir.matchType === 'reg' ? 'selected' : ''}>Regex (reg)</option>
                                <option value="found" ${redir.matchType === 'found' ? 'selected' : ''}>Exists</option>
                                <option value="notfound" ${redir.matchType === 'notfound' ? 'selected' : ''}>Not Exists</option>
                            </select>
                            <input type="text" value="${escapeHtml(redir.value || '')}" placeholder="Value" onchange="getFe(${feId}).domainPathRoutes[${ri}].redirections[${rri}].value=this.value" ${redir.matchType === 'found' || redir.matchType === 'notfound' ? 'disabled' : ''}>
                            <input type="text" value="${redir.backend}" placeholder="Backend" onchange="getFe(${feId}).domainPathRoutes[${ri}].redirections[${rri}].backend=this.value" style="max-width:160px">
                            <button class="btn-ghost" onclick="getFe(${feId}).domainPathRoutes[${ri}].redirections.splice(${rri},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                        </div>
                    `).join('') || '<span class="text-sm text-muted">No redirections. Add cookie/query/header-based routing rules.</span>'}
                </div>
            </div>
        </div>
    </div>`;
}

function renderRateLimiting(feId, rl) {
    if (!rl) return '<span class="text-sm text-muted">No rate limiting configured</span>';

    return `
    <!-- Implicit -->
    <div class="sub-section mb-2">
        <div class="sub-section-header">
            <span>Implicit Rate Limiting (per-host, from map file)</span>
        </div>
        <div class="sub-section-body">
            <div class="form-group mb-1">
                <label class="checkbox-label">
                    <input type="checkbox" ${rl.implicit?.enabled ? 'checked' : ''} onchange="getFe(${feId}).rateLimiting.implicit.enabled=this.checked;renderFrontends()"> Enable Implicit Rate Limiting
                </label>
            </div>
            ${rl.implicit?.enabled ? `
            <div class="flex justify-between items-center mb-1">
                <span class="text-sm text-muted">Map entries: domain pattern → rate,mode (0=enforce, 1=dryrun)</span>
                <button class="btn btn-xs btn-accent" onclick="addImplicitRLEntry(${feId})"><i class="fas fa-plus"></i></button>
            </div>
            ${(rl.implicit.entries || []).map((e, ei) => `
                <div class="inline-item">
                    <span class="inline-item-label">Pattern</span>
                    <input type="text" value="${escapeHtml(e.pattern)}" onchange="getFe(${feId}).rateLimiting.implicit.entries[${ei}].pattern=this.value" placeholder="^domain\\.com$">
                    <span class="inline-item-label">Rate</span>
                    <input type="number" value="${e.rate}" onchange="getFe(${feId}).rateLimiting.implicit.entries[${ei}].rate=parseInt(this.value)" style="max-width:100px">
                    <span class="inline-item-label">Mode</span>
                    <select onchange="getFe(${feId}).rateLimiting.implicit.entries[${ei}].mode=parseInt(this.value)" style="max-width:110px">
                        <option value="0" ${e.mode === 0 ? 'selected' : ''}>Enforce</option>
                        <option value="1" ${e.mode === 1 ? 'selected' : ''}>Dry Run</option>
                    </select>
                    <button class="btn-ghost" onclick="getFe(${feId}).rateLimiting.implicit.entries.splice(${ei},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                </div>
            `).join('') || '<span class="text-sm text-muted">No implicit entries</span>'}
            ` : ''}
        </div>
    </div>

    <!-- Explicit -->
    <div class="sub-section mb-2">
        <div class="sub-section-header">
            <span>Explicit Rate Limiting Rules</span>
            <button class="btn btn-xs btn-accent" onclick="addExplicitRLRule(${feId})"><i class="fas fa-plus"></i></button>
        </div>
        <div class="sub-section-body">
            ${(rl.explicit?.rules || []).map((rule, rli) => `
                <div class="sub-section mb-1">
                    <div class="sub-section-header">
                        <span>Rule #${rule.id} (${rule.type}, ${rule.mode})</span>
                        <button class="btn-ghost" onclick="getFe(${feId}).rateLimiting.explicit.rules.splice(${rli},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="sub-section-body">
                        <div class="form-grid cols-4">
                            <div class="form-group">
                                <label>Rule ID</label>
                                <input type="text" value="${rule.id}" onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].id=this.value">
                            </div>
                            <div class="form-group">
                                <label>Type</label>
                                <select onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].type=this.value;renderFrontends()">
                                    <option value="host" ${rule.type === 'host' ? 'selected' : ''}>Host</option>
                                    <option value="host_ip" ${rule.type === 'host_ip' ? 'selected' : ''}>Host + IP</option>
                                    <option value="ip" ${rule.type === 'ip' ? 'selected' : ''}>IP</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Mode</label>
                                <select onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].mode=this.value">
                                    <option value="enforce" ${rule.mode === 'enforce' ? 'selected' : ''}>Enforce</option>
                                    <option value="dryrun" ${rule.mode === 'dryrun' ? 'selected' : ''}>Dry Run</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Limit (req/min)</label>
                                <input type="number" value="${rule.limit}" onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].limit=parseInt(this.value)">
                            </div>
                            <div class="form-group full-width">
                                <label>Domains (comma-separated)</label>
                                <input type="text" value="${rule.domains.join(', ')}" onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].domains=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
                            </div>
                        </div>
                        <!-- ACL Conditions -->
                        <div class="flex justify-between items-center mt-2 mb-1">
                            <span class="text-sm text-muted">ACL Conditions (optional)</span>
                            <button class="btn btn-xs btn-outline" onclick="addRLAclCondition(${feId},${rli})"><i class="fas fa-plus"></i> Add ACL</button>
                        </div>
                        ${(rule.aclConditions || []).map((acl, ai) => `
                            <div class="inline-item">
                                <select onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].aclConditions[${ai}].variable=this.value" style="max-width:100px">
                                    <option value="host" ${acl.variable === 'host' ? 'selected' : ''}>Host</option>
                                    <option value="ip" ${acl.variable === 'ip' ? 'selected' : ''}>IP</option>
                                </select>
                                <input type="text" value="${(acl.values || []).join(', ')}" placeholder="Values (comma-sep)" onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].aclConditions[${ai}].values=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
                                <label class="checkbox-label" style="min-width:auto">
                                    <input type="checkbox" ${acl.negate ? 'checked' : ''} onchange="getFe(${feId}).rateLimiting.explicit.rules[${rli}].aclConditions[${ai}].negate=this.checked"> Negate
                                </label>
                                <button class="btn-ghost" onclick="getFe(${feId}).rateLimiting.explicit.rules[${rli}].aclConditions.splice(${ai},1);renderFrontends()"><i class="fas fa-trash"></i></button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('') || '<span class="text-sm text-muted">No explicit rate limiting rules</span>'}
        </div>
    </div>

    <!-- Cluster -->
    <div class="sub-section">
        <div class="sub-section-header">
            <span>Cluster-Level Rate Limiting (Catch-All)</span>
        </div>
        <div class="sub-section-body">
            <div class="form-grid cols-2">
                <div class="form-group">
                    <label>Rate Limit (req/min)</label>
                    <input type="number" value="${rl.cluster?.rate || 600000}" onchange="getFe(${feId}).rateLimiting.cluster.rate=parseInt(this.value)">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" ${rl.cluster?.dryrun ? 'checked' : ''} onchange="getFe(${feId}).rateLimiting.cluster.dryrun=this.checked"> Dry Run Mode
                    </label>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── Frontend Helpers ────────────────────────────────────────────────────────

function getFe(id) { return state.frontends.find(f => f._id === id); }

function ensureObj(obj, key) {
    if (!obj[key]) obj[key] = {};
}

function addBind(feId) {
    getFe(feId).binds.push({ port: 8080, ssl: false });
    renderFrontends();
}

function addResponseHeader(feId) {
    const fe = getFe(feId);
    if (!fe.responseHeaders) fe.responseHeaders = [];
    fe.responseHeaders.push({ name: '', value: '' });
    renderFrontends();
}

function addWafRule(feId) {
    getFe(feId).wafRules.push({
        id: '' + nextId(),
        domains: [],
        simulation: { enabled: false },
        block: { enabled: false },
        testing: { enabled: false }
    });
    renderFrontends();
}

function addDomainPathRoute(feId) {
    getFe(feId).domainPathRoutes.push({
        id: '' + nextId(),
        domains: [],
        pathPattern: '',
        pathType: 'starts',
        redirections: []
    });
    renderFrontends();
}

function addRedirection(feId, ri) {
    getFe(feId).domainPathRoutes[ri].redirections.push({
        type: 'cookie', name: '', matchType: 'str', value: '', backend: ''
    });
    renderFrontends();
}

function addMapEntry(feId, field) {
    getFe(feId)[field].push({ pattern: '', backend: '' });
    renderFrontends();
}

function addImplicitRLEntry(feId) {
    getFe(feId).rateLimiting.implicit.entries.push({ pattern: '', rate: 50000, mode: 0 });
    renderFrontends();
}

function addExplicitRLRule(feId) {
    const fe = getFe(feId);
    if (!fe.rateLimiting.explicit) fe.rateLimiting.explicit = { rules: [] };
    fe.rateLimiting.explicit.rules.push({
        id: '' + nextId(), type: 'host', mode: 'enforce',
        domains: [], limit: 1000, aclConditions: []
    });
    renderFrontends();
}

function addRLAclCondition(feId, rli) {
    const rule = getFe(feId).rateLimiting.explicit.rules[rli];
    if (!rule.aclConditions) rule.aclConditions = [];
    rule.aclConditions.push({ variable: 'host', values: [], negate: false });
    renderFrontends();
}

function duplicateFrontend(id) {
    const fe = getFe(id);
    const clone = JSON.parse(JSON.stringify(fe));
    clone._id = nextId();
    clone.name = fe.name + '_copy';
    state.frontends.push(clone);
    renderFrontends();
    showToast('Frontend duplicated', 'success');
}

function initFeTabs(feId) {
    const tabsContainer = document.getElementById(`fe-tabs-${feId}`);
    if (!tabsContainer) return;
    tabsContainer.querySelectorAll('.fe-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabsContainer.querySelectorAll('.fe-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            const parent = document.getElementById(`fe-${feId}`);
            parent.querySelectorAll('.fe-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

function toggleCollapse(id) {
    document.getElementById(id).classList.toggle('collapsed');
}

// ─── Backends ────────────────────────────────────────────────────────────────

function addBackend() {
    const id = nextId();
    state.backends.push({
        _id: id,
        name: 'L7-' + id + '.https',
        comment: '',
        balance: 'roundrobin',
        dynamicCookieKey: 'zalb_' + Math.random().toString(36).substring(2, 12),
        healthCheck: { method: 'GET', path: '/grid/login/servercheck.jsp', expectStatus: 400 },
        defaultServer: { check: true, inter: '10s', rise: 2, fall: 2 },
        servers: []
    });
    renderBackends();
    showToast('Backend added', 'success');
}

function removeBackend(id) {
    state.backends = state.backends.filter(b => b._id !== id);
    renderBackends();
    showToast('Backend removed', 'info');
}

function renderBackends() {
    const container = document.getElementById('backendsList');
    if (state.backends.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-server"></i><p>No backends configured. Click "Add Backend".</p></div>`;
        return;
    }
    container.innerHTML = state.backends.map((be, bi) => renderBackendItem(be, bi)).join('');
}

function renderBackendItem(be, bi) {
    const id = be._id;
    return `
    <div class="dynamic-item" id="be-${id}">
        <div class="dynamic-item-header" onclick="toggleCollapse('be-${id}')">
            <div class="dynamic-item-title">
                <i class="fas fa-chevron-down chevron"></i>
                <i class="fas fa-server" style="color:var(--success)"></i>
                <span>${be.name}</span>
                <span class="badge">${be.servers.length} server(s)</span>
            </div>
            <div class="dynamic-item-actions">
                <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();removeBackend(${id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="dynamic-item-body">
            <div class="form-grid cols-2">
                <div class="form-group">
                    <label>Backend Name</label>
                    <input type="text" value="${be.name}" onchange="getBe(${id}).name=this.value;renderBackends()">
                </div>
                <div class="form-group">
                    <label>Comment</label>
                    <input type="text" value="${be.comment || ''}" onchange="getBe(${id}).comment=this.value" placeholder="e.g. L7-ACME.https">
                </div>
                <div class="form-group">
                    <label>Balance Algorithm</label>
                    <select onchange="getBe(${id}).balance=this.value">
                        <option value="roundrobin" ${be.balance === 'roundrobin' ? 'selected' : ''}>Round Robin</option>
                        <option value="leastconn" ${be.balance === 'leastconn' ? 'selected' : ''}>Least Connections</option>
                        <option value="source" ${be.balance === 'source' ? 'selected' : ''}>Source</option>
                        <option value="uri" ${be.balance === 'uri' ? 'selected' : ''}>URI</option>
                        <option value="hdr(Host)" ${be.balance === 'hdr(Host)' ? 'selected' : ''}>Header (Host)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Dynamic Cookie Key</label>
                    <input type="text" value="${be.dynamicCookieKey || ''}" onchange="getBe(${id}).dynamicCookieKey=this.value">
                </div>
            </div>

            <!-- Health Check -->
            <div class="sub-section mt-2">
                <div class="sub-section-header"><span>Health Check</span></div>
                <div class="sub-section-body">
                    <div class="form-grid cols-4">
                        <div class="form-group">
                            <label>Method</label>
                            <select onchange="getBe(${id}).healthCheck.method=this.value">
                                <option value="GET" ${be.healthCheck?.method === 'GET' ? 'selected' : ''}>GET</option>
                                <option value="HEAD" ${be.healthCheck?.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
                                <option value="OPTIONS" ${be.healthCheck?.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Path</label>
                            <input type="text" value="${be.healthCheck?.path || ''}" onchange="getBe(${id}).healthCheck.path=this.value">
                        </div>
                        <div class="form-group">
                            <label>Expect Status</label>
                            <input type="number" value="${be.healthCheck?.expectStatus || 200}" onchange="getBe(${id}).healthCheck.expectStatus=parseInt(this.value)">
                        </div>
                        <div class="form-group">
                            <label>Check Interval</label>
                            <input type="text" value="${be.defaultServer?.inter || '10s'}" onchange="getBe(${id}).defaultServer.inter=this.value">
                        </div>
                        <div class="form-group">
                            <label>Rise</label>
                            <input type="number" value="${be.defaultServer?.rise || 2}" onchange="getBe(${id}).defaultServer.rise=parseInt(this.value)">
                        </div>
                        <div class="form-group">
                            <label>Fall</label>
                            <input type="number" value="${be.defaultServer?.fall || 2}" onchange="getBe(${id}).defaultServer.fall=parseInt(this.value)">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Servers -->
            <div class="sub-section mt-2">
                <div class="sub-section-header">
                    <span>Servers</span>
                    <button class="btn btn-xs btn-accent" onclick="addServer(${id})"><i class="fas fa-plus"></i> Add Server</button>
                </div>
                <div class="sub-section-body">
                    ${be.servers.map((s, si) => `
                        <div class="inline-item">
                            <span class="inline-item-label">Name</span>
                            <input type="text" value="${s.name}" onchange="getBe(${id}).servers[${si}].name=this.value" placeholder="server1">
                            <span class="inline-item-label">Address</span>
                            <input type="text" value="${s.address}" onchange="getBe(${id}).servers[${si}].address=this.value" placeholder="172.20.x.x:port">
                            <button class="btn-ghost" onclick="getBe(${id}).servers.splice(${si},1);renderBackends()"><i class="fas fa-trash"></i></button>
                        </div>
                    `).join('') || '<span class="text-sm text-muted">No servers added</span>'}
                </div>
            </div>
        </div>
    </div>`;
}

function getBe(id) { return state.backends.find(b => b._id === id); }

function addServer(beId) {
    getBe(beId).servers.push({ name: '', address: '' });
    renderBackends();
}

// ─── Rate Limit Tables ───────────────────────────────────────────────────────

function renderRateLimitTables() {
    const container = document.getElementById('rateLimitTablesList');
    container.innerHTML = state.rateLimitTables.map((t, ti) => `
        <div class="inline-item">
            <span class="inline-item-label">Name</span>
            <input type="text" value="${t.name}" onchange="state.rateLimitTables[${ti}].name=this.value">
            <span class="inline-item-label">Type</span>
            <input type="text" value="${t.type}" onchange="state.rateLimitTables[${ti}].type=this.value" style="max-width:80px">
            <span class="inline-item-label">Len</span>
            <input type="number" value="${t.len}" onchange="state.rateLimitTables[${ti}].len=parseInt(this.value)" style="max-width:80px">
            <span class="inline-item-label">Size</span>
            <input type="text" value="${t.size}" onchange="state.rateLimitTables[${ti}].size=this.value" style="max-width:80px">
            <span class="inline-item-label">Expire</span>
            <input type="text" value="${t.expire}" onchange="state.rateLimitTables[${ti}].expire=this.value" style="max-width:80px">
            <span class="inline-item-label">Store</span>
            <input type="text" value="${t.store}" onchange="state.rateLimitTables[${ti}].store=this.value" style="max-width:160px">
            <button class="btn-ghost" onclick="state.rateLimitTables.splice(${ti},1);renderRateLimitTables()"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

function addRateLimitTable() {
    state.rateLimitTables.push({ name: 'st_new_table', type: 'string', len: 256, size: '200k', expire: '1m', store: 'http_req_rate(1m)' });
    renderRateLimitTables();
}

// ─── Collect Form Data → Config JSON ─────────────────────────────────────────

function collectConfigJSON() {
    const config = {
        clusterName: val('g_clusterName'),
        global: {
            pidfile: val('g_pidfile'),
            sslPassphraseFile: val('g_sslPassphraseFile'),
            user: val('g_user'),
            group: val('g_group'),
            daemon: document.getElementById('g_daemon').checked,
            nbthread: intVal('g_nbthread'),
            sslCacheSize: intVal('g_sslCacheSize'),
            sslLifetime: intVal('g_sslLifetime'),
            statsSocket: {
                path: val('g_ssPath'),
                mode: val('g_ssMode'),
                level: val('g_ssLevel'),
                exposeFdListeners: document.getElementById('g_ssExposeFd').checked
            },
            maxconn: intVal('g_maxconn'),
            log: { target: val('g_logTarget'), facility: val('g_logFacility') },
            sslDefaultBindCiphersuites: val('g_sslDefaultBindCiphersuites'),
            healthVar: val('g_healthVar')
        },
        defaults: {
            mode: val('d_mode'),
            logGlobal: document.getElementById('d_logGlobal').checked,
            timeoutClient: val('d_timeoutClient'),
            timeoutServer: val('d_timeoutServer'),
            timeoutHttpRequest: val('d_timeoutHttpRequest'),
            timeoutConnect: val('d_timeoutConnect'),
            forwardFor: val('d_forwardFor'),
            compression: {
                algo: val('d_compressionAlgo'),
                types: val('d_compressionTypes')
            },
            logFormat: val('d_logFormat')
        },
        httpErrors: {
            name: val('ep_name'),
            files: state.errorPages
        },
        frontends: state.frontends.map(fe => {
            const f = { ...fe };
            delete f._id;
            return f;
        }),
        backends: state.backends.map(be => {
            const b = { ...be };
            delete b._id;
            return b;
        }),
        rateLimitTables: state.rateLimitTables.map(t => ({
            name: t.name,
            stickTable: { type: t.type, len: t.len, size: t.size, expire: t.expire, store: t.store }
        })),
        stats: {
            enabled: document.getElementById('st_enabled').checked,
            port: intVal('st_port'),
            refresh: val('st_refresh'),
            uri: val('st_uri'),
            auth: val('st_auth') || undefined,
            showModules: document.getElementById('st_showModules').checked
        }
    };
    return config;
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function intVal(id) {
    return parseInt(val(id)) || 0;
}

// ─── Generate Config ─────────────────────────────────────────────────────────

async function generateConfig() {
    try {
        const configJSON = collectConfigJSON();
        const resp = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configJSON)
        });
        const result = await resp.json();

        if (result.error) {
            showToast('Error: ' + result.error, 'error');
            return;
        }

        state.generatedConfig = result.config;
        state.generatedMapFiles = result.mapFiles;

        // Update preview
        document.getElementById('configPreview').textContent = result.config;

        // Update map files
        renderMapFilesPreview();

        // Update status
        const badge = document.getElementById('configStatus');
        badge.textContent = 'Generated';
        badge.className = 'badge success';

        showToast('Configuration generated successfully!', 'success');
        switchSection('preview');
    } catch (err) {
        showToast('Error generating config: ' + err.message, 'error');
    }
}

function renderMapFilesPreview() {
    const container = document.getElementById('mapFilesPreview');
    const maps = state.generatedMapFiles;
    if (!maps || Object.keys(maps).length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-map"></i><p>No map files generated</p></div>`;
        return;
    }
    container.innerHTML = Object.entries(maps).map(([name, content]) => `
        <div class="card map-file-card">
            <div class="card-header">
                <span><i class="fas fa-file-alt"></i> ${name}</span>
                <button class="btn btn-xs btn-outline" onclick="copyMapFile('${name}')"><i class="fas fa-copy"></i></button>
            </div>
            <div class="card-body">
                <div class="map-file-content">${escapeHtml(content)}</div>
            </div>
        </div>
    `).join('');
}

// ─── Export / Download ───────────────────────────────────────────────────────

function downloadConfig() {
    if (!state.generatedConfig) {
        showToast('Generate config first', 'error');
        return;
    }
    downloadFile('haproxy.cfg', state.generatedConfig);
}

function downloadAll() {
    if (!state.generatedConfig) {
        showToast('Generate config first', 'error');
        return;
    }
    downloadFile('haproxy.cfg', state.generatedConfig);
    if (state.generatedMapFiles) {
        Object.entries(state.generatedMapFiles).forEach(([name, content]) => {
            setTimeout(() => downloadFile(name, content), 300);
        });
    }
    showToast('All files downloaded', 'success');
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function copyConfig() {
    if (!state.generatedConfig) {
        showToast('Generate config first', 'error');
        return;
    }
    navigator.clipboard.writeText(state.generatedConfig);
    showToast('Config copied to clipboard', 'success');
}

function copyMapFile(name) {
    if (state.generatedMapFiles && state.generatedMapFiles[name]) {
        navigator.clipboard.writeText(state.generatedMapFiles[name]);
        showToast(`${name} copied`, 'success');
    }
}

function exportJSON() {
    const configJSON = collectConfigJSON();
    downloadFile('haproxy-config.json', JSON.stringify(configJSON, null, 2));
    showToast('JSON exported', 'success');
}

function importConfig() {
    document.getElementById('importModal').classList.add('active');
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
}

function doImport() {
    try {
        const json = JSON.parse(document.getElementById('importJsonInput').value);
        populateFromJSON(json);
        closeImportModal();
        showToast('Configuration imported successfully', 'success');
    } catch (err) {
        showToast('Invalid JSON: ' + err.message, 'error');
    }
}

// ─── Load Sample ─────────────────────────────────────────────────────────────

async function loadSample() {
    try {
        const resp = await fetch('/api/sample');
        const sample = await resp.json();
        populateFromJSON(sample);
        showToast('Sample configuration loaded!', 'success');
    } catch (err) {
        showToast('Error loading sample: ' + err.message, 'error');
    }
}

function populateFromJSON(json) {
    // Global
    if (json.clusterName) setVal('g_clusterName', json.clusterName);
    if (json.global) {
        const g = json.global;
        setVal('g_pidfile', g.pidfile);
        setVal('g_sslPassphraseFile', g.sslPassphraseFile);
        setVal('g_user', g.user);
        setVal('g_group', g.group);
        setChecked('g_daemon', g.daemon);
        setVal('g_nbthread', g.nbthread);
        setVal('g_sslCacheSize', g.sslCacheSize);
        setVal('g_sslLifetime', g.sslLifetime);
        if (g.statsSocket) {
            setVal('g_ssPath', g.statsSocket.path);
            setVal('g_ssMode', g.statsSocket.mode);
            setVal('g_ssLevel', g.statsSocket.level);
            setChecked('g_ssExposeFd', g.statsSocket.exposeFdListeners);
        }
        setVal('g_maxconn', g.maxconn);
        if (g.log) {
            setVal('g_logTarget', g.log.target);
            setVal('g_logFacility', g.log.facility);
        }
        setVal('g_sslDefaultBindCiphersuites', g.sslDefaultBindCiphersuites);
        setVal('g_healthVar', g.healthVar);
    }

    // Defaults
    if (json.defaults) {
        const d = json.defaults;
        setVal('d_mode', d.mode);
        setChecked('d_logGlobal', d.logGlobal);
        setVal('d_timeoutClient', d.timeoutClient);
        setVal('d_timeoutServer', d.timeoutServer);
        setVal('d_timeoutHttpRequest', d.timeoutHttpRequest);
        setVal('d_timeoutConnect', d.timeoutConnect);
        setVal('d_forwardFor', d.forwardFor);
        if (d.compression) {
            setVal('d_compressionAlgo', d.compression.algo);
            setVal('d_compressionTypes', d.compression.types);
        }
        setVal('d_logFormat', d.logFormat);
    }

    // Error pages
    if (json.httpErrors) {
        setVal('ep_name', json.httpErrors.name);
        state.errorPages = json.httpErrors.files || [];
        renderErrorPages();
    }

    // Frontends
    if (json.frontends) {
        state.frontends = json.frontends.map(fe => ({
            ...fe,
            _id: nextId(),
            wafRules: fe.wafRules || [],
            domainPathRoutes: fe.domainPathRoutes || [],
            mapEntries: fe.mapEntries || [],
            defaultMapEntries: fe.defaultMapEntries || [],
            rateLimiting: fe.rateLimiting || { implicit: { enabled: false, entries: [] }, explicit: { rules: [] }, cluster: { rate: 600000, dryrun: false } }
        }));
        renderFrontends();
    }

    // Backends
    if (json.backends) {
        state.backends = json.backends.map(be => ({
            ...be,
            _id: nextId(),
            servers: be.servers || []
        }));
        renderBackends();
    }

    // Rate limit tables
    if (json.rateLimitTables) {
        state.rateLimitTables = json.rateLimitTables.map(t => ({
            name: t.name,
            type: t.stickTable?.type || 'string',
            len: t.stickTable?.len || 256,
            size: t.stickTable?.size || '200k',
            expire: t.stickTable?.expire || '1m',
            store: t.stickTable?.store || 'http_req_rate(1m)'
        }));
        renderRateLimitTables();
    }

    // Stats
    if (json.stats) {
        setChecked('st_enabled', json.stats.enabled);
        setVal('st_port', json.stats.port);
        setVal('st_refresh', json.stats.refresh);
        setVal('st_uri', json.stats.uri);
        setVal('st_auth', json.stats.auth || '');
        setChecked('st_showModules', json.stats.showModules);
    }
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
}

function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    renderErrorPages();
    renderFrontends();
    renderBackends();
    renderRateLimitTables();
});

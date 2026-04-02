/**
 * HAProxy Configuration Generator Engine
 * Generates production-grade haproxy.cfg and map files from structured JSON input.
 */

// ─── Global Section ──────────────────────────────────────────────────────────

function generateGlobal(g) {
    const lines = ['global'];
    if (g.pidfile) lines.push(`\tpidfile ${g.pidfile}`);
    if (g.sslPassphraseFile) lines.push(`\tssl-passphrase-file ${g.sslPassphraseFile}`);
    if (g.user) lines.push(`\tuser ${g.user}`);
    if (g.group) lines.push(`\tgroup ${g.group}`);
    if (g.daemon) lines.push(`\tdaemon `);
    if (g.nbthread) lines.push(`\tnbthread ${g.nbthread}`);
    if (g.sslCacheSize) lines.push(`\ttune.ssl.cachesize ${g.sslCacheSize}`);
    if (g.sslLifetime) lines.push(`\ttune.ssl.lifetime ${g.sslLifetime}`);
    if (g.statsSocket) {
        const ss = g.statsSocket;
        let line = `\tstats socket ${ss.path}`;
        if (ss.mode) line += ` mode ${ss.mode}`;
        if (ss.level) line += ` level ${ss.level}`;
        if (ss.exposeFdListeners) line += ` expose-fd listeners`;
        lines.push(line);
    }
    if (g.maxconn) lines.push(`\tmaxconn ${g.maxconn}`);
    if (g.log) lines.push(`\tlog ${g.log.target} ${g.log.facility}`);
    if (g.sslDefaultBindCiphersuites) lines.push(`\tssl-default-bind-ciphersuites ${g.sslDefaultBindCiphersuites}`);
    if (g.customLines) {
        g.customLines.forEach(l => lines.push(`\t${l}`));
    }
    if (g.healthVar) lines.push(`\tset-var proc.health str("${g.healthVar}")`);
    return lines.join('\n');
}

// ─── Defaults Section ────────────────────────────────────────────────────────

function generateDefaults(d) {
    const lines = ['', 'defaults'];
    if (d.mode) lines.push(`\tmode ${d.mode}`);
    if (d.logGlobal) lines.push(`\tlog global`);
    if (d.timeoutClient) lines.push(`\ttimeout client ${d.timeoutClient}`);
    if (d.timeoutServer) lines.push(`\ttimeout server ${d.timeoutServer}`);
    if (d.timeoutHttpRequest) lines.push(`\ttimeout http-request ${d.timeoutHttpRequest}`);
    if (d.forwardFor) lines.push(`\toption forwardfor header ${d.forwardFor}`);
    if (d.compression) {
        if (d.compression.algo) lines.push(`\tcompression algo ${d.compression.algo}`);
        if (d.compression.types) lines.push(`\tcompression type ${d.compression.types}`);
    }
    if (d.logFormat) lines.push(`\tlog-format "${d.logFormat}"`);
    if (d.timeoutConnect) lines.push(`\ttimeout connect\t ${d.timeoutConnect}`);
    if (d.customLines) {
        d.customLines.forEach(l => lines.push(`\t${l}`));
    }
    return lines.join('\n');
}

// ─── HTTP Errors Section ─────────────────────────────────────────────────────

function generateHttpErrors(errors) {
    if (!errors || !errors.name || !errors.files || errors.files.length === 0) return '';
    const lines = ['', `http-errors ${errors.name}`];
    errors.files.forEach(e => {
        lines.push(`\terrorfile ${e.statusCode} ${e.filePath}`);
    });
    return lines.join('\n');
}

// ─── Frontend Section ────────────────────────────────────────────────────────

function generateFrontend(fe, clusterName) {
    const lines = ['', `frontend ${fe.name}`];

    // Binds
    (fe.binds || []).forEach(b => {
        let line = `\tbind :${b.port}`;
        if (b.ssl) {
            if (b.alpn) line += ` alpn ${b.alpn}`;
            if (b.defaultCrt) line += ` default-crt ${b.defaultCrt}`;
            line += ` ssl`;
            if (b.crtDir) line += ` crt ${b.crtDir}`;
            if (b.tlsTicketKeys) line += ` tls-ticket-keys ${b.tlsTicketKeys}`;
            if (b.sslMinVer) line += ` ssl-min-ver ${b.sslMinVer}`;
            if (b.ciphers) line += ` ciphers ${b.ciphers}`;
        }
        lines.push(line);
    });

    // HTTP to HTTPS redirect
    if (fe.httpToHttpsRedirect) {
        lines.push(`\thttp-request redirect scheme https code 301 unless { ssl_fc }`);
    }

    // Standard request setup
    lines.push(`\thttp-request set-var(txn.host) req.hdr(Host)`);
    lines.push(`\thttp-request set-var(txn.req_base) base`);

    // Monitor
    if (fe.monitorUri) {
        lines.push(`\tmonitor-uri ${fe.monitorUri}`);
        if (fe.healthStatusMap) {
            lines.push(`\tmonitor fail if { var(proc.health),map_reg(${fe.healthStatusMap}) -m str "down" }`);
        }
    }

    // Request ID
    lines.push(`\thttp-request set-var(req.req_id) unique-id`);
    lines.push(`\thttp-request set-header LB_REQUEST_ID %[var(req.req_id)]`);

    // Response headers
    if (fe.responseHeaders) {
        fe.responseHeaders.forEach(h => {
            lines.push(`\thttp-response set-header ${h.name} ${h.value}`);
        });
    } else {
        lines.push(`\thttp-response set-header ZALB_REQUEST_ID %[var(req.req_id)]`);
        lines.push(`\thttp-response set-header Strict-Transport-Security "max-age=64072000; includeSubDomains;"`);
    }

    // Error files
    if (fe.errorfilesRef) {
        lines.push(`\terrorfiles ${fe.errorfilesRef}`);
    }

    lines.push('');

    // IP Access Control
    if (fe.ipAccessControl && fe.ipAccessControl.allowedIps) {
        lines.push(`\thttp-request deny deny_status 403 if !{ src ${fe.ipAccessControl.allowedIps.join(' ')} }`);
    }

    // WAF Rules
    if (fe.wafRules && fe.wafRules.length > 0) {
        lines.push('');
        fe.wafRules.forEach(waf => {
            const aclName = `waf_host_${waf.id}`;
            const domains = waf.domains.join(' ');
            lines.push(`\tacl ${aclName} req.hdr(Host) -i ${domains}`);

            // Simulation rule
            if (waf.simulation && waf.simulation.enabled) {
                lines.push(`\thttp-request set-header LB_WAF_SIMULATION "Rule: block" if ${aclName} { src ${waf.simulation.srcIp} }`);
            }

            // Block rule with exclusions
            if (waf.block && waf.block.enabled) {
                let blockLine = `\thttp-request deny deny_status 403 if ${aclName}`;
                if (waf.block.excludeDomains && waf.block.excludeDomains.length > 0) {
                    waf.block.excludeDomains.forEach(d => {
                        blockLine += ` !{ req.hdr(Host) -m str ${d} }`;
                    });
                }
                lines.push(blockLine);
            }

            // Testing rule
            if (waf.testing && waf.testing.enabled) {
                lines.push(`\thttp-request set-header LB_WAF_SIMULATION "Rule: testing" if ${aclName} { path -m str ${waf.testing.path} }`);
            }

            lines.push('');
        });
    }

    // Domain+Path routing with redirections (cookie/query/header)
    if (fe.domainPathRoutes && fe.domainPathRoutes.length > 0) {
        lines.push('');
        fe.domainPathRoutes.forEach(route => {
            const aclName = `domain_path_${route.id}`;
            const domainsPattern = route.domains.join('|');

            // Build the regex pattern based on path type
            let pathPattern;
            const cleanPath = (route.pathPattern || '').replace(/^\/|\/$/g, '');
            if (route.pathType === 'regex') {
                pathPattern = `^(${domainsPattern})/${cleanPath}`;
            } else if (route.pathType === 'starts') {
                pathPattern = `^(${domainsPattern})/${cleanPath}/`;
            } else {
                pathPattern = `^(${domainsPattern})/`;
            }

            lines.push(`\tacl ${aclName} base -m reg ${pathPattern}`);

            // Generate redirections
            (route.redirections || []).forEach(redir => {
                let condition = '';
                if (redir.type === 'cookie') {
                    condition = `{ cook(${redir.name}) -m str ${redir.value} }`;
                } else if (redir.type === 'query') {
                    condition = `{ url_param(${redir.name}) -m str ${redir.value} }`;
                } else if (redir.type === 'header') {
                    if (redir.matchType === 'str') {
                        condition = `{ hdr(${redir.name}) -m str ${redir.value} }`;
                    } else if (redir.matchType === 'reg') {
                        condition = `{ hdr(${redir.name}) -m reg -i ${redir.value} }`;
                    } else if (redir.matchType === 'found') {
                        condition = `{ hdr(${redir.name}) -m found }`;
                    } else if (redir.matchType === 'notfound') {
                        condition = `!{ hdr(${redir.name}) -m found }`;
                    }
                }

                lines.push(`\thttp-request set-var(txn.backend) str(${redir.backend}) if ${aclName} ${condition} !{ var(txn.backend) -m found }`);
            });

            lines.push('');
        });
    }

    // Map file based backend resolution
    const portPair = fe.binds.map(b => b.port).join('-');
    const mapBaseName = clusterName || 'L7-Haproxy';
    if (fe.mapFile !== false) {
        const primaryMap = fe.primaryMapFile || `/home/offloader/haproxy/conf/haproxy-${mapBaseName}-${portPair}.map`;
        const defaultMap = fe.defaultMapFile || `/home/offloader/haproxy/conf/haproxy-default-${mapBaseName}-${portPair}.map`;
        lines.push(`\thttp-request set-var(txn.backend) base,map_reg(${primaryMap}) if !{ var(txn.backend) -m found }`);
        lines.push(`\thttp-request set-var(txn.backend) base,map_reg(${defaultMap}) if !{ var(txn.backend) -m found }`);
        lines.push(`\thttp-request deny deny_status 400 if !{ var(txn.backend) -m found }`);
    }

    // Rate Limiting
    if (fe.rateLimiting) {
        const rl = fe.rateLimiting;
        lines.push('');
        lines.push(`\t#Rate limiting - track sc0 by host`);
        lines.push(`\thttp-request track-sc0 req.hdr(Host),lower table st_ratelimit_host`);
        lines.push(`\thttp-request set-var(txn.rl_current_rate) sc_http_req_rate(0,st_ratelimit_host)`);

        // Implicit rate limiting
        if (rl.implicit && rl.implicit.enabled) {
            const implicitMap = rl.implicit.mapFile || `/home/offloader/haproxy/conf/haproxy-ratelimit-implicit-${mapBaseName}.map`;
            lines.push('');
            lines.push(`\t#Implicit rate limiting`);
            lines.push(`\thttp-request set-var(txn.rl_implicit) req.hdr(Host),lower,map_reg(${implicitMap})`);
            lines.push(`\thttp-request set-var(txn.rl_rate) var(txn.rl_implicit),field(1,\\,)`);
            lines.push(`\thttp-request set-var(txn.rl_mode) var(txn.rl_implicit),field(2,\\,)`);
            lines.push(`\tacl rl_implicit_exists var(txn.rl_implicit) -m found`);
            lines.push(`\tacl rl_implicit_exceeded var(txn.rl_current_rate),sub(txn.rl_rate) -m int gt 0`);
            lines.push(`\tacl rl_implicit_dryrun var(txn.rl_mode) -m int eq 1`);
            lines.push(`\thttp-request set-var(txn.rl_dryrun_log) var(txn.rl_dryrun_log),concat(|rl_implicit) if rl_implicit_exists rl_implicit_exceeded rl_implicit_dryrun { var(txn.rl_dryrun_log) -m found }`);
            lines.push(`\thttp-request set-var(txn.rl_dryrun_log) str(rl_implicit) if rl_implicit_exists rl_implicit_exceeded rl_implicit_dryrun !{ var(txn.rl_dryrun_log) -m found }`);
            lines.push(`\thttp-request deny deny_status 429 if rl_implicit_exists rl_implicit_exceeded !rl_implicit_dryrun`);
        }

        // Explicit rate limiting
        if (rl.explicit && rl.explicit.rules && rl.explicit.rules.length > 0) {
            lines.push('');
            lines.push(`\t#Explicit rate limiting (per-rule, shared table st_explicit_rl)`);
            lines.push(`\t`);
            lines.push(`\t#Capture ACL variable values`);
            lines.push(`\thttp-request set-var(txn.rl_acl_host) req.hdr(Host),lower`);
            lines.push(`\thttp-request set-var(txn.rl_acl_ip) src`);

            // Group explicit rules by type and generate trackers
            const hasHostIp = rl.explicit.rules.some(r => r.type === 'host_ip');
            const hasIp = rl.explicit.rules.some(r => r.type === 'ip');

            if (hasHostIp) {
                lines.push(`\t`);
                lines.push(`\t#Explicit rate limiting - host + ACL var:ip (sc1, composite)`);
                lines.push(`\thttp-request set-var(txn.rl_host) req.hdr(Host),lower`);
                lines.push(`\thttp-request set-var(txn.rl_key_host_ip) req.hdr(Host),lower,concat(:,txn.rl_host),concat(:,txn.rl_acl_ip)`);
                lines.push(`\thttp-request track-sc1 var(txn.rl_key_host_ip) table st_explicit_rl`);
                lines.push(`\thttp-request set-var(txn.rl_host_ip_cur_rate) sc_http_req_rate(1,st_explicit_rl)`);
            }

            if (hasIp) {
                lines.push(`\t`);
                lines.push(`\t#Explicit rate limiting - ip (sc2)`);
                lines.push(`\thttp-request set-var(txn.rl_ip) src`);
                lines.push(`\thttp-request set-var(txn.rl_key_ip) req.hdr(Host),lower,concat(:,txn.rl_ip)`);
                lines.push(`\thttp-request track-sc2 var(txn.rl_key_ip) table st_explicit_rl`);
                lines.push(`\thttp-request set-var(txn.rl_ip_cur_rate) sc_http_req_rate(2,st_explicit_rl)`);
            }

            const hasHost = rl.explicit.rules.some(r => r.type === 'host');
            if (hasHost) {
                lines.push(`\t`);
                lines.push(`\t#Explicit rate limiting - host`);
                lines.push(`\thttp-request set-var(txn.rl_host_cur_rate) sc_http_req_rate(0,st_ratelimit_host)`);
            }

            // Generate each explicit rule
            rl.explicit.rules.forEach(rule => {
                lines.push(`\t`);
                const ruleId = rule.id;
                const mode = rule.mode || 'enforce'; // enforce or dryrun
                const domains = rule.domains.join(' ');
                const limit = rule.limit;

                lines.push(`\t#Rule ${ruleId} (${rule.type}, ${mode})`);
                lines.push(`\tacl rl_${ruleId}_host req.hdr(Host),lower -m str ${domains}`);

                let rateVar;
                if (rule.type === 'host') {
                    rateVar = 'txn.rl_host_cur_rate';
                } else if (rule.type === 'host_ip') {
                    rateVar = 'txn.rl_host_ip_cur_rate';
                } else if (rule.type === 'ip') {
                    rateVar = 'txn.rl_ip_cur_rate';
                }

                lines.push(`\tacl rl_${ruleId}_exceeded var(${rateVar}) -m int gt ${limit}`);

                // ACL conditions
                if (rule.aclConditions && rule.aclConditions.length > 0) {
                    rule.aclConditions.forEach(acl => {
                        const aclVar = acl.variable === 'host' ? 'txn.rl_acl_host' : 'txn.rl_acl_ip';
                        const values = acl.values.join(' ');
                        lines.push(`\tacl rl_${ruleId}_acl_hit var(${aclVar}) -m str ${values}`);
                    });
                }

                // Deny line
                let denyLine = `\thttp-request deny deny_status 429 if rl_${ruleId}_host rl_${ruleId}_exceeded`;
                if (rule.aclConditions && rule.aclConditions.length > 0) {
                    rule.aclConditions.forEach(acl => {
                        denyLine += acl.negate ? ` !rl_${ruleId}_acl_hit` : ` rl_${ruleId}_acl_hit`;
                    });
                }
                lines.push(denyLine);
            });
        }

        // Cluster-level rate limiting
        if (rl.cluster) {
            lines.push('');
            lines.push(`\t#Cluster-level rate limiting (catch-all, sc0)`);
            lines.push(`\thttp-request set-var(txn.rl_cluster_rate) int(${rl.cluster.rate})`);
            lines.push(`\thttp-request set-var(txn.rl_cluster_mode) int(${rl.cluster.dryrun ? 1 : 0})`);
            lines.push(`\tacl rl_cluster_exceeded var(txn.rl_current_rate),sub(txn.rl_cluster_rate) -m int gt 0`);
            lines.push(`\tacl rl_cluster_dryrun var(txn.rl_cluster_mode) -m int eq 1`);
            lines.push(`\thttp-request set-var(txn.rl_dryrun_log) var(txn.rl_dryrun_log),concat(|rl_cluster) if rl_cluster_exceeded rl_cluster_dryrun { var(txn.rl_dryrun_log) -m found }`);
            lines.push(`\thttp-request set-var(txn.rl_dryrun_log) str(rl_cluster) if rl_cluster_exceeded rl_cluster_dryrun !{ var(txn.rl_dryrun_log) -m found }`);
            lines.push(`\thttp-request deny deny_status 429 if rl_cluster_exceeded !rl_cluster_dryrun`);
        }
    }

    // Final backend selection
    lines.push(`\tuse_backend %[var(txn.backend)]`);

    return lines.join('\n');
}

// ─── Backend Section ─────────────────────────────────────────────────────────

function generateBackend(be) {
    const lines = [];
    if (be.comment) lines.push(`#${be.comment}`);
    lines.push(`backend ${be.name}`);
    if (be.balance) lines.push(`\tbalance ${be.balance}`);
    if (be.dynamicCookieKey) {
        lines.push(`\tdynamic-cookie-key ${be.dynamicCookieKey}`);
        lines.push(`\tcookie ${be.dynamicCookieKey} insert indirect dynamic secure httponly`);
    }
    if (be.healthCheck) {
        lines.push(`\toption httpchk ${be.healthCheck.method || 'GET'} ${be.healthCheck.path}`);
        if (be.defaultServer) {
            const ds = be.defaultServer;
            let dsLine = `\tdefault-server`;
            if (ds.check) dsLine += ` check`;
            if (ds.inter) dsLine += ` inter ${ds.inter}`;
            if (ds.rise) dsLine += ` rise ${ds.rise}`;
            if (ds.fall) dsLine += ` fall ${ds.fall}`;
            lines.push(dsLine);
        }
        lines.push(`\thttp-check expect status ${be.healthCheck.expectStatus || 200}`);
    }
    if (be.customLines) {
        be.customLines.forEach(l => lines.push(`\t${l}`));
    }
    (be.servers || []).forEach(s => {
        lines.push(`\tserver ${s.name || s.address} ${s.address}`);
    });

    // Stick table for rate limiting backends
    if (be.stickTable) {
        const st = be.stickTable;
        lines.push(`\tstick-table type ${st.type || 'string'} len ${st.len || 256} size ${st.size || '200k'} expire ${st.expire || '1m'} store ${st.store || 'http_req_rate(1m)'}`);
    }

    return lines.join('\n');
}

// ─── Stats Frontend ──────────────────────────────────────────────────────────

function generateStats(stats) {
    if (!stats || !stats.enabled) return '';
    const lines = ['', 'frontend stats'];
    lines.push(`\tmode http`);
    lines.push(`\tbind :${stats.port || 8079}`);
    lines.push(`\tstats enable`);
    if (stats.refresh) lines.push(`\tstats refresh ${stats.refresh}`);
    if (stats.uri) lines.push(`\tstats uri ${stats.uri}`);
    if (stats.showModules) lines.push(`\tstats show-modules`);
    if (stats.auth) lines.push(`\tstats auth ${stats.auth}`);
    return lines.join('\n');
}

// ─── Map File Generator ─────────────────────────────────────────────────────

function generateMapFiles(config) {
    const mapFiles = {};

    (config.frontends || []).forEach(fe => {
        const portPair = fe.binds.map(b => b.port).join('-');
        const clusterName = config.clusterName || 'L7-Haproxy';
        const primaryKey = `haproxy-${clusterName}-${portPair}.map`;
        const defaultKey = `haproxy-default-${clusterName}-${portPair}.map`;

        // Primary map: domain+path mappings
        if (fe.mapEntries && fe.mapEntries.length > 0) {
            const mapLines = [];
            fe.mapEntries.forEach(entry => {
                mapLines.push(`${entry.pattern} ${entry.backend}`);
            });
            mapFiles[primaryKey] = mapLines.join('\n');
        }

        // Default map
        if (fe.defaultMapEntries && fe.defaultMapEntries.length > 0) {
            const mapLines = [];
            fe.defaultMapEntries.forEach(entry => {
                mapLines.push(`${entry.pattern} ${entry.backend}`);
            });
            mapFiles[defaultKey] = mapLines.join('\n');
        }

        // Rate limit implicit map
        if (fe.rateLimiting && fe.rateLimiting.implicit && fe.rateLimiting.implicit.entries) {
            const rlKey = `haproxy-ratelimit-implicit-${clusterName}.map`;
            const rlLines = [];
            fe.rateLimiting.implicit.entries.forEach(entry => {
                rlLines.push(`${entry.pattern} ${entry.rate},${entry.mode}`);
            });
            mapFiles[rlKey] = rlLines.join('\n');
        }
    });

    return mapFiles;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

function generateFullConfig(config) {
    const sections = [];

    // Global
    if (config.global) {
        sections.push(generateGlobal(config.global));
    }

    // Defaults
    if (config.defaults) {
        sections.push(generateDefaults(config.defaults));
    }

    // HTTP Errors
    if (config.httpErrors) {
        const errSection = generateHttpErrors(config.httpErrors);
        if (errSection) sections.push(errSection);
    }

    // Frontends
    (config.frontends || []).forEach(fe => {
        sections.push(generateFrontend(fe, config.clusterName));
    });

    // Backends
    (config.backends || []).forEach(be => {
        sections.push('');
        sections.push(generateBackend(be));
    });

    // Rate limit stick tables
    if (config.rateLimitTables) {
        config.rateLimitTables.forEach(t => {
            sections.push('');
            sections.push(generateBackend(t));
        });
    }

    // Stats
    if (config.stats) {
        sections.push(generateStats(config.stats));
    }

    // Map files
    const mapFiles = generateMapFiles(config);

    return {
        config: sections.join('\n'),
        mapFiles
    };
}

module.exports = { generateFullConfig, generateMapFiles };

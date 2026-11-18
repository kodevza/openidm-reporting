"use strict";
(function () {
    if (request.method !== 'read') {
        throw { code: 405, message: 'Read only' };
    }
    var roles = context.security && context.security.authorization && context.security.authorization.roles || [];
    if (roles.indexOf('openidm-auditor') < 0 && roles.indexOf('openidm-admin') < 0) {
        throw { code: 403, message: 'Auditor role required' };
    }
    // OpenIDM returns JSON wrappers whose arrays are not native Rhino arrays.
    // Their string representation preserves JSON array and nested object types.
    function nativeObject(value) {
        var json = String(value);
        return value && typeof value === 'object' && json.charAt(0) === '{'
            ? JSON.parse(json) : value;
    }
    function invalidConfig() { throw { code: 500, message: 'Invalid CSV reporting configuration' }; }
    var config = nativeObject(openidm.read('config/custom/reporting'));
    if (!config || !Array.isArray(config.reports) || !config.reports.length) {
        invalidConfig();
    }
    var reports = {}, names = [];
    var idPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    var pathPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_-]+)*$/;
    var sourcePattern = /^(managed|repo|audit|workflow)\/[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/;
    var forbiddenKey = /^(?:__proto__|prototype|constructor)$/;
    config.reports.forEach(function (report) {
        if (!report || typeof report.id !== 'string' || !idPattern.test(report.id) ||
            Object.prototype.hasOwnProperty.call(reports, report.id) ||
            typeof report.title !== 'string' || !report.title ||
            typeof report.filename !== 'string' || !/^[a-zA-Z0-9._-]+\.csv$/.test(report.filename) ||
            (report.source !== undefined) === (report.sources !== undefined) ||
            (report.source !== undefined && (typeof report.source !== 'string' || !sourcePattern.test(report.source))) ||
            (report.sources !== undefined && (!Array.isArray(report.sources) || !report.sources.length ||
                report.sources.some(function (source) { return typeof source !== 'string' || !sourcePattern.test(source); }) ||
                report.sources.some(function (source, index) { return report.sources.indexOf(source) !== index; }))) ||
            (report.filter !== undefined && (typeof report.filter !== 'string' || !report.filter)) ||
            !Array.isArray(report.columns) || !report.columns.length) {
            invalidConfig();
        }
        report.columns.forEach(function (column) {
            if (!column || (column.visible !== undefined && typeof column.visible !== 'boolean') || typeof column.header !== 'string' || !column.header ||
                (column.path !== undefined) === Object.prototype.hasOwnProperty.call(column, 'value') ||
                (column.path !== undefined && (typeof column.path !== 'string' || !pathPattern.test(column.path) ||
                    column.path.split('.').some(function (key) { return forbiddenKey.test(key); }))) ||
                (Object.prototype.hasOwnProperty.call(column, 'value') &&
                    column.value !== null && ['string', 'number', 'boolean'].indexOf(typeof column.value) < 0)) {
                invalidConfig();
            }
        });
        report.columns.forEach(function (column) {
            var p = column.presentation;
            if (p !== undefined) {
                if (!p || ['user', 'entraObject'].indexOf(p.kind) < 0 || column.path === undefined) {
                    invalidConfig();
                }
                ['localIdPath', 'tenantIdPath', 'sourcePath', 'objectTypePath'].forEach(function (field) {
                    var value = p[field];
                    if (value !== undefined && (typeof value !== 'string' || !pathPattern.test(value) ||
                        value.split('.').some(function (key) { return forbiddenKey.test(key); }))) {
                        invalidConfig();
                    }
                });
                if (p.kind === 'entraObject' && (!p.tenantIdPath || !p.sourcePath || !p.objectTypePath)) {
                    invalidConfig();
                }
            }
        });
        report.columns.forEach(function (column) {
            if (column.filterType !== undefined && (!column.path || ['text', 'person', 'enum', 'date'].indexOf(column.filterType) < 0 ||
                (column.filterType === 'person' && (!column.presentation || column.presentation.kind !== 'user')) ||
                (column.filterType === 'enum' && (!Array.isArray(column.filterValues) || !column.filterValues.length ||
                    column.filterValues.some(function (item) { return !item || typeof item.id !== 'string' || typeof item.title !== 'string'; }))))) {
                invalidConfig();
            }
        });
        reports[report.id] = report;
        names.push({ id: report.id, title: report.title });
    });
    if (typeof config.defaultReport !== 'string' ||
        !Object.prototype.hasOwnProperty.call(reports, config.defaultReport)) {
        invalidConfig();
    }
    var params = request.additionalParameters || {};
    function badFilter() { throw { code: 400, message: 'Invalid report filter' }; }
    if (params.dictionary !== undefined) {
        if (params.dictionary !== 'people') {
            badFilter();
        }
        var search = params.search === undefined ? '' : params.search;
        var peopleOffset = params.peopleOffset === undefined ? '0' : String(params.peopleOffset);
        if (typeof search !== 'string' || search.length > 100 || !/^(0|[1-9][0-9]{0,8})$/.test(peopleOffset)) {
            badFilter();
        }
        var words = search.trim().split(/\s+/).filter(function (word) { return !!word; });
        if (words.length > 5) {
            badFilter();
        }
        var peopleFilter = words.map(function (word) {
            return '(' + ['givenName', 'sn', 'displayName', 'userName', 'entraUserPrincipalName'].map(function (field) {
                return '/' + field + ' sw ' + JSON.stringify(word);
            }).join(' or ') + ')';
        }).join(' and ') || 'true';
        var people = nativeObject(openidm.query('managed/user', { _queryFilter: peopleFilter, _pageSize: 21,
            _pagedResultsOffset: Number(peopleOffset), _sortKeys: 'givenName,sn,_id' }, ['_id', 'givenName', 'sn', 'displayName', 'userName', 'entraUserPrincipalName']));
        if (!people || !Array.isArray(people.result)) {
            throw { code: 500, message: 'Invalid people dictionary response' };
        }
        return { items: people.result.slice(0, 20).map(function (user) {
                var name = [user.givenName, user.sn].filter(function (part) { return typeof part === 'string' && part.trim(); }).join(' ').trim();
                return { id: user._id, title: name || user.displayName || user.userName || user._id,
                    description: user.entraUserPrincipalName || user.userName || '' };
            }), nextOffset: people.result.length > 20 ? Number(peopleOffset) + 20 : null };
    }
    function workflowCatalog() {
        var definitions = nativeObject(openidm.query('workflow/processdefinition', { _queryId: 'filtered-query' }, ['key', 'name', 'version']));
        if (!definitions || !Array.isArray(definitions.result)) {
            throw { code: 500, message: 'Unable to load workflow definitions' };
        }
        var seen = {}, workflows = [];
        definitions.result.sort(function (a, b) { return Number(b.version || 0) - Number(a.version || 0); }).forEach(function (definition) {
            if (typeof definition.key !== 'string' || Object.prototype.hasOwnProperty.call(seen, definition.key)) {
                return;
            }
            seen[definition.key] = true;
            workflows.push({ id: definition.key, title: definition.name || definition.key });
        });
        return workflows.sort(function (a, b) { return a.title.localeCompare(b.title); });
    }
    if (params.capabilities === 'true') {
        var history = reports['workflow-history'];
        return { allowed: true, reports: names,
            workflows: params.workflows === 'true' ? workflowCatalog() : undefined,
            columns: history ? history.columns.map(function (column) { return { header: column.header, visible: column.visible !== false, key: column.path, filterType: column.filterType, filterValues: column.filterValues }; }) : [] };
    }
    var id = params.report === undefined ? config.defaultReport : params.report;
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(reports, id)) {
        throw { code: 400, message: 'Unknown report' };
    }
    var report = reports[id];
    var sources = report.sources || [report.source];
    var sourceIndexText = params.sourceIndex === undefined ? '0' : String(params.sourceIndex);
    if (!/^(0|[1-9][0-9]{0,8})$/.test(sourceIndexText) || Number(sourceIndexText) >= sources.length) {
        throw { code: 400, message: 'Invalid source index' };
    }
    var sourceIndex = Number(sourceIndexText);
    var offset = params.offset === undefined ? '0' : String(params.offset);
    if (!/^(0|[1-9][0-9]{0,8})$/.test(offset)) {
        throw { code: 400, message: 'Invalid offset' };
    }
    var workflow = params.workflow;
    if (workflow !== undefined && (id !== 'workflow-history' || typeof workflow !== 'string' ||
        !workflowCatalog().some(function (item) { return item.id === workflow; }))) {
        throw { code: 400, message: 'Unknown workflow' };
    }
    var queryFilter = report.filter || 'true';
    if (workflow !== undefined) {
        queryFilter = '(' + queryFilter + ') and /processType eq ' + JSON.stringify(workflow);
    }
    var pageSize = params.pageSize === undefined ? 500 : Number(params.pageSize);
    if (pageSize !== 50 && pageSize !== 500) {
        badFilter();
    }
    var filters = {};
    if (params.filters !== undefined) {
        if (typeof params.filters !== 'string' || params.filters.length > 8192) {
            badFilter();
        }
        try {
            filters = JSON.parse(params.filters);
        }
        catch (error) {
            badFilter();
        }
        if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
            badFilter();
        }
    }
    var selectedPeople = {};
    Object.keys(filters).forEach(function (key) {
        var columns = report.columns.filter(function (column) { return column.path === key && !!column.filterType; });
        if (columns.length !== 1) {
            badFilter();
        }
        var column = columns[0], value = filters[key], clause = '';
        if (column.filterType === 'date') {
            if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length ||
                Object.keys(value).some(function (part) { return part !== 'from' && part !== 'to'; })) {
                badFilter();
            }
            var dates = [];
            ['from', 'to'].forEach(function (part) {
                if (value[part] !== undefined) {
                    if (typeof value[part] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[part]) ||
                        !isFinite(Date.parse(value[part])) || new Date(value[part]).toISOString() !== value[part]) {
                        badFilter();
                    }
                    dates.push('/' + key + (part === 'from' ? ' ge ' : ' le ') + JSON.stringify(value[part]));
                }
            });
            if (value.from && value.to && value.from > value.to) {
                badFilter();
            }
            clause = dates.join(' and ');
        }
        else {
            if (typeof value !== 'string' || !value.trim() || value.length > 200) {
                badFilter();
            }
            if (column.filterType === 'text') {
                clause = '/' + key + ' sw ' + JSON.stringify(value.trim());
            }
            if (column.filterType === 'enum') {
                if (!column.filterValues.some(function (item) { return item.id === value; })) {
                    badFilter();
                }
                clause = '/' + key + ' eq ' + JSON.stringify(value);
            }
            if (column.filterType === 'person') {
                if (!Object.prototype.hasOwnProperty.call(selectedPeople, value)) {
                    var matches = nativeObject(openidm.query('managed/user', { _queryFilter: '/_id eq ' + JSON.stringify(value), _pageSize: 2 }, ['_id', 'userName', 'entraOidcSubject', 'entraWorkflowAliases']));
                    if (!matches || !Array.isArray(matches.result) || matches.result.length !== 1 || matches.result[0]._id !== value) {
                        badFilter();
                    }
                    selectedPeople[value] = matches.result[0];
                }
                var user = selectedPeople[value], localPath = column.presentation.localIdPath;
                if (localPath) {
                    clause = '/' + localPath + ' eq ' + JSON.stringify(value);
                }
                else {
                    var aliases = [user._id, user.userName, user.entraOidcSubject].concat(Array.isArray(user.entraWorkflowAliases) ? user.entraWorkflowAliases : []);
                    aliases = aliases.filter(function (alias, index) { return typeof alias === 'string' && !!alias && aliases.indexOf(alias) === index; });
                    if (aliases.length > 100) {
                        badFilter();
                    }
                    clause = aliases.map(function (alias) { return '/' + key + ' eq ' + JSON.stringify(alias); }).join(' or ');
                }
            }
        }
        queryFilter = '(' + queryFilter + ') and (' + clause + ')';
    });
    // Explicit projection limits the fields read. No caller-supplied resource or filter.
    var fields = ['_id'];
    report.columns.forEach(function (column) {
        if (column.path !== undefined) {
            var field = column.path.split('.')[0];
            if (fields.indexOf(field) < 0) {
                fields.push(field);
            }
            if (column.presentation) {
                ['localIdPath', 'tenantIdPath', 'sourcePath', 'objectTypePath'].forEach(function (key) {
                    var path = column.presentation[key];
                    if (path && fields.indexOf(path.split('.')[0]) < 0) {
                        fields.push(path.split('.')[0]);
                    }
                });
            }
        }
    });
    var page = nativeObject(openidm.query(sources[sourceIndex], {
        _queryFilter: queryFilter, _pageSize: pageSize === 50 ? 51 : 500,
        _pagedResultsOffset: Number(offset), _sortKeys: id === 'workflow-history' ? '-createdAt,-_id' : '_id'
    }, fields));
    if (!page || !Array.isArray(page.result)) {
        throw { code: 500, message: 'Invalid CSV query response' };
    }
    var hasMore = pageSize === 50 ? page.result.length > 50 : page.result.length === 500;
    if (pageSize === 50) {
        page.result = page.result.slice(0, 50);
    }
    function valueAt(record, path) {
        var keys = path.split('.'), current = record;
        for (var i = 0; i < keys.length; i++) {
            if (current === null || current === undefined) {
                return '';
            }
            current = current[keys[i]];
        }
        if (current === null || current === undefined) {
            return '';
        }
        return typeof current === 'object' ? JSON.stringify(current) : current;
    }
    function cell(value) {
        var text = value === null || value === undefined ? '' : String(value);
        // Protect spreadsheet users from formula execution, including leading whitespace.
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) {
            text = "'" + text;
        }
        return '"' + text.replace(/"/g, '""') + '"';
    }
    var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Fixed portal targets; arbitrary stored URLs are never rendered as hyperlinks.
    function entraLink(type, objectId, tenantId) {
        if (typeof objectId !== 'string' || typeof tenantId !== 'string' || !uuid.test(objectId) || !uuid.test(tenantId)) {
            return null;
        }
        var blades = {
            user: 'Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/',
            servicePrincipal: 'Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/',
            group: 'Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/'
        };
        if (!Object.prototype.hasOwnProperty.call(blades, type)) {
            return null;
        }
        return 'https://entra.microsoft.com/' + encodeURIComponent(tenantId) + '/#view/' + blades[type] + encodeURIComponent(objectId);
    }
    var principals = {};
    function servicePrincipalLink(objectId, tenantId) {
        var base = entraLink('servicePrincipal', objectId, tenantId);
        if (!base) {
            return null;
        }
        var key = JSON.stringify([objectId, tenantId]);
        if (!Object.prototype.hasOwnProperty.call(principals, key)) {
            var matches = nativeObject(openidm.query('managed/entraServicePrincipal', {
                _queryFilter: '/sourceId eq ' + JSON.stringify(objectId) + ' and /tenantId eq ' + JSON.stringify(tenantId), _pageSize: 2
            }, ['sourceId', 'tenantId', 'appId', 'servicePrincipalType']));
            if (!matches || !Array.isArray(matches.result)) {
                throw { code: 500, message: 'Invalid service principal query response' };
            }
            principals[key] = matches.result.length === 1 ? matches.result[0] : null;
        }
        var principal = principals[key];
        if (!principal || String(principal.sourceId).toLowerCase() !== objectId.toLowerCase() ||
            String(principal.tenantId).toLowerCase() !== tenantId.toLowerCase() ||
            typeof principal.appId !== 'string' || !uuid.test(principal.appId) ||
            typeof principal.servicePrincipalType !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(principal.servicePrincipalType)) {
            return null;
        }
        return base + '/appId/' + encodeURIComponent(principal.appId) +
            '/preferredSingleSignOnMode~/null/servicePrincipalType/' + encodeURIComponent(principal.servicePrincipalType) + '/fromNav/';
    }
    var users = {};
    function present(record, column, raw) {
        var p = column.presentation;
        if (!p) {
            return { text: raw, href: null };
        }
        var tenant = p.tenantIdPath ? valueAt(record, p.tenantIdPath) : '';
        if (p.kind === 'entraObject') {
            var type = valueAt(record, p.objectTypePath);
            return { text: raw, href: valueAt(record, p.sourcePath) === 'entra' ?
                    (type === 'servicePrincipal' ? servicePrincipalLink(raw, tenant) : entraLink(type, raw, tenant)) : null };
        }
        var localId = p.localIdPath ? valueAt(record, p.localIdPath) : '';
        if (!localId && (typeof raw !== 'string' || !raw)) {
            return { text: raw, href: null };
        }
        var key = JSON.stringify([localId, raw, tenant]);
        if (!Object.prototype.hasOwnProperty.call(users, key)) {
            var filter = localId ? '/_id eq ' + JSON.stringify(localId) :
                '(/userName eq ' + JSON.stringify(raw) + ' or /_id eq ' + JSON.stringify(raw) +
                    ' or /entraOidcSubject eq ' + JSON.stringify(raw) + ')';
            if (tenant) {
                filter = '(' + filter + ') and /entraTenantId eq ' + JSON.stringify(tenant);
            }
            var matches = nativeObject(openidm.query('managed/user', { _queryFilter: filter, _pageSize: 2 }, ['givenName', 'sn', 'displayName', 'entraObjectId', 'entraTenantId']));
            if (!matches || !Array.isArray(matches.result)) {
                throw { code: 500, message: 'Invalid workflow identity query response' };
            }
            users[key] = matches.result.length === 1 ? matches.result[0] : null;
        }
        var user = users[key];
        if (!user || (tenant && String(user.entraTenantId).toLowerCase() !== String(tenant).toLowerCase())) {
            return { text: raw, href: null };
        }
        var parts = [user.givenName, user.sn].filter(function (part) { return typeof part === 'string' && part.trim(); }).map(function (part) { return part.trim(); });
        var fullName = parts.join(' ');
        return { text: (parts.length === 2 ? fullName : user.displayName || fullName) || raw, href: entraLink('user', user.entraObjectId, user.entraTenantId) };
    }
    var header = report.columns.map(function (column) { return cell(column.header); }).join(';');
    var rawValues = [], links = [];
    var values = page.result.map(function (record) {
        var original = [], targets = [];
        var row = report.columns.map(function (column) {
            var raw = column.path !== undefined ? valueAt(record, column.path) : (column.value === null ? '' : column.value);
            var display = present(record, column, raw);
            original.push(raw);
            targets.push(display.href);
            return display.text;
        });
        rawValues.push(original);
        links.push(targets);
        return row;
    });
    var rows = values.map(function (row) { return row.map(cell).join(';'); });
    var moreInSource = hasMore;
    var moreSources = sourceIndex + 1 < sources.length;
    return { report: id, header: header, csv: rows.join('\r\n'),
        columns: report.columns.map(function (column) { return column.header; }), rows: values, rawRows: rawValues, links: links,
        nextOffset: moreInSource ? Number(offset) + pageSize : (moreSources ? 0 : null),
        nextSourceIndex: moreInSource ? sourceIndex : (moreSources ? sourceIndex + 1 : null),
        filename: report.filename };
}());

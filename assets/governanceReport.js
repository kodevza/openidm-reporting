// SPDX-License-Identifier: CDDL-1.1
// Only this projection is exposed to auditors; no general managed/workflow access.
(function () {
    if (request.method !== 'read') { throw {code:405, message:'Read only'}; }
    var roles = context.security && context.security.authorization && context.security.authorization.roles || [];
    if (roles.indexOf('openidm-auditor') < 0 && roles.indexOf('openidm-admin') < 0) {
        throw {code:403, message:'Auditor role required'};
    }
    var params = request.additionalParameters || {};
    if (params.capabilities === 'true') { return {allowed:true}; }
    var offset = String(params.offset || '0');
    if (!/^(0|[1-9][0-9]{0,8})$/.test(offset)) { throw {code:400, message:'Invalid offset'}; }
    var fields = ['_id','servicePrincipalId','servicePrincipalName','previousOwnerRef','newOwnerId',
        'newOwnerUserName','requester','reason','status','createdAt','decidedBy','decidedAt'];
    var page = openidm.query('managed/entraOwnerRequest', {
        _queryFilter:'true', _pageSize:500, _pagedResultsOffset:Number(offset), _sortKeys:'_id'
    }, fields);
    function cell(value) {
        var text = value == null ? '' : String(value);
        // Protect spreadsheet users from formulas, including leading whitespace/control characters.
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) { text = "'" + text; }
        return '"' + text.replace(/"/g, '""') + '"';
    }
    var header = ['processId','servicePrincipalLocalId','servicePrincipalName','previousOwnerRef','newOwnerLocalId',
        'newOwnerUserName','requester','reason','status','createdAt','decidedBy','decidedAt','recordType'];
    var rows = page.result.map(function (record) {
        return fields.map(function (field) { return cell(record[field]); }).concat([cell('ownership_assignment')]).join(';');
    });
    return {header:header.map(cell).join(';'), csv:rows.join('\r\n'),
        nextOffset:page.result.length === 500 ? Number(offset) + 500 : null,
        filename:'governance-ownership-history.csv'};
}());

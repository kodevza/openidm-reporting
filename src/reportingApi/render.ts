// SPDX-License-Identifier: CDDL-1.1
namespace ReportingApi {
    function valueAt(record: Record<string, any>, path: string): ReportCell {
        var keys = path.split('.'), current = record;
        for (var i = 0; i < keys.length; i++) {
            if (current === null || current === undefined) { return ''; }
            current = current[keys[i]];
        }
        if (current === null || current === undefined) { return ''; }
        return typeof current === 'object' ? JSON.stringify(current) : current;
    }
    function cell(value: any): string {
        var text = value === null || value === undefined ? '' : String(value);
        // Protect spreadsheet users from formula execution, including leading whitespace.
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) { text = "'" + text; }
        return '"' + text.replace(/"/g, '""') + '"';
    }
    function createPresenter(openidm: IDM) {
        var identities = new IdentityLookup(openidm);
        var entraLinks = new EntraLinks(identities);
        function present(record: Record<string, any>, column: ReportColumn, raw: ReportCell): {text: ReportCell; href: string | null} {
            var p = column.presentation;
            if (!p) { return {text:raw, href:null}; }
            var tenant = p.tenantIdPath ? valueAt(record, p.tenantIdPath) : '';
            if (p.kind === 'entraObject') {
                var type = valueAt(record, p.objectTypePath!);
                return {text:raw, href:valueAt(record, p.sourcePath!) === 'entra' ?
                    (type === 'servicePrincipal' ? entraLinks.servicePrincipal(raw, tenant) : entraLinks.object(type, raw, tenant)) : null};
            }
            var localId = p.localIdPath ? valueAt(record, p.localIdPath) : '';
            if (!localId && (typeof raw !== 'string' || !raw)) { return {text:raw, href:null}; }
            var user = identities.workflowUser(localId, raw, tenant);
            if (!user || (tenant && String(user.entraTenantId).toLowerCase() !== String(tenant).toLowerCase())) { return {text:raw, href:null}; }
            var parts = [user.givenName, user.sn].filter(function (part) { return typeof part === 'string' && part.trim(); }).map(function (part) { return part.trim(); });
            var fullName = parts.join(' ');
            return {text:(parts.length === 2 ? fullName : user.displayName || fullName) || raw, href:entraLinks.object('user', user.entraObjectId, user.entraTenantId)};
        }
        return present;
    }

    export function renderRows(openidm: IDM, report: ReportProfile, records: Record<string, any>[]): RenderedRows {
        var present = createPresenter(openidm);
        var header = report.columns.map(function (column) { return cell(column.header); }).join(';');
        var rawValues: ReportCell[][] = [], links: (string | null)[][] = [];
        var values = records.map(function (record: Record<string, any>) {
            var original: ReportCell[] = [], targets: (string | null)[] = [];
            var row = report.columns.map(function (column) {
                var raw = column.path !== undefined ? valueAt(record, column.path) : (column.value == null ? '' : column.value);
                var display = present(record, column, raw);
                original.push(raw); targets.push(display.href);
                return display.text;
            });
            rawValues.push(original); links.push(targets);
            return row;
        });
        var rows = values.map(function (row: ReportCell[]) { return row.map(cell).join(';'); });
        return {header:header, csv:rows.join('\r\n'), rows:values, rawRows:rawValues, links:links};
    }
}

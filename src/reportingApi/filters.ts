// SPDX-License-Identifier: CDDL-1.1
namespace ReportingApi {
    export function buildFilter(openidm: IDM, report: ReportProfile, params: Record<string, any>,
            personal?: {reviewerPath: string; accountId: string}) {
        var workflow = params.workflow;
        var queryFilter = report.filter || 'true';
        if (personal) {
            queryFilter = '(' + queryFilter + ') and /' + personal.reviewerPath + ' eq ' + JSON.stringify(personal.accountId);
        }
        if (workflow !== undefined) {
            queryFilter = '(' + queryFilter + ') and /processType eq ' + JSON.stringify(workflow);
        }

        var filters: Record<string, any> = {};
        if (params.filters !== undefined) {
            if (typeof params.filters !== 'string' || params.filters.length > 8192) { badFilter(); }
            try { filters = JSON.parse(params.filters); } catch (error) { badFilter(); }
            if (!filters || typeof filters !== 'object' || Array.isArray(filters)) { badFilter(); }
        }
        var selectedPeople: Record<string, any> = {};
        Object.keys(filters).forEach(function (key) {
            var columns = report.columns.filter(function (column) { return column.path === key && !!column.filterType; });
            if (columns.length !== 1) { badFilter(); }
            var column = columns[0], value = filters[key], clause = '';
            if (column.filterType === 'date') {
                if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length ||
                        Object.keys(value).some(function (part) { return part !== 'from' && part !== 'to'; })) { badFilter(); }
                var dates: string[] = [];
                ['from','to'].forEach(function (part) {
                    if (value[part] !== undefined) {
                        if (typeof value[part] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[part]) ||
                                !isFinite(Date.parse(value[part])) || new Date(value[part]).toISOString() !== value[part]) { badFilter(); }
                        dates.push('/' + key + (part === 'from' ? ' ge ' : ' le ') + JSON.stringify(value[part]));
                    }
                });
                if (value.from && value.to && value.from > value.to) { badFilter(); }
                clause = dates.join(' and ');
            } else {
                if (typeof value !== 'string' || !value.trim() || value.length > 200) { badFilter(); }
                if (column.filterType === 'text') { clause = '/' + key + ' sw ' + JSON.stringify(value.trim()); }
                if (column.filterType === 'enum') {
                    if (!column.filterValues!.some(function (item) { return item.id === value; })) { badFilter(); }
                    clause = '/' + key + ' eq ' + JSON.stringify(value);
                }
                if (column.filterType === 'person') {
                    if (personal) { badFilter(); }
                    if (!Object.prototype.hasOwnProperty.call(selectedPeople, value)) {
                        var matches = nativeObject(openidm.query('managed/user', {_queryFilter:'/_id eq ' + JSON.stringify(value), _pageSize:2},
                            ['_id','userName','entraOidcSubject','entraWorkflowAliases']));
                        if (!matches || !Array.isArray(matches.result) || matches.result.length !== 1 || matches.result[0]._id !== value) { badFilter(); }
                        selectedPeople[value] = matches.result[0];
                    }
                    var user = selectedPeople[value], localPath = column.presentation!.localIdPath;
                    if (localPath) { clause = '/' + localPath + ' eq ' + JSON.stringify(value); }
                    else {
                        var aliases = [user._id,user.userName,user.entraOidcSubject].concat(Array.isArray(user.entraWorkflowAliases) ? user.entraWorkflowAliases : []);
                        aliases = aliases.filter(function (alias: any, index: number) { return typeof alias === 'string' && !!alias && aliases.indexOf(alias) === index; });
                        if (aliases.length > 100) { badFilter(); }
                        clause = aliases.map(function (alias: string) { return '/' + key + ' eq ' + JSON.stringify(alias); }).join(' or ');
                    }
                }
            }
            queryFilter = '(' + queryFilter + ') and (' + clause + ')';
        });

        return queryFilter;
    }
}

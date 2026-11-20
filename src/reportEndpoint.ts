// SPDX-License-Identifier: CDDL-1.1
/**
 * Server-side reporting API for OpenIDM clients at endpoint/governanceReport.
 *
 * Workflow History and My Tasks use it to load their table setup and result
 * pages. CSV export fetches the same report page by page. The people picker
 * uses a separate lookup on this endpoint to populate a report filter.
 *
 * config/custom/reporting defines which sources and fields can be read.
 * In My Tasks, report rows are scoped to the signed-in managed user.
 */
(function serveGovernanceReport(): ReportingApi.EndpointResponse {
    if (request.method !== 'read') { throw {code:405, message:'Read only'}; }
    var params = request.additionalParameters || {};
    var myTasks = params.myTasks === 'true';
    var accountId = authorizeRequest();

    var config = ReportingApi.loadConfig(openidm);
    var reports = config.reports;
    enforceMyTasksScope();

    if (params.dictionary !== undefined) {
        if (params.dictionary !== 'people') { ReportingApi.badFilter(); }
        return ReportingApi.peopleDictionary(openidm, params);
    }

    var history = reports['workflow-history'];
    var reviewer = history && history.columns.filter(function (column) { return column.path === 'reviewer'; })[0];
    var reviewerPath = reviewer && reviewer.presentation && reviewer.presentation.localIdPath;
    if (myTasks && !reviewerPath) {
        throw {code:500, message:'Missing workflow history reviewer ID configuration'};
    }
    if (params.capabilities === 'true') {
        return describeReportOptions();
    }
    return readReportPage();

    function authorizeRequest() {
        var authorization = context.security && context.security.authorization;
        var roles = authorization && authorization.roles || [];
        var accountId = authorization && authorization.id;
        if (myTasks) {
            if (roles.indexOf('openidm-authorized') < 0 || !authorization ||
                    authorization.component !== 'managed/user' || typeof accountId !== 'string' || !accountId) {
                throw {code:403, message:'Managed user account required'};
            }
        } else if (roles.indexOf('openidm-auditor') < 0 && roles.indexOf('openidm-admin') < 0) {
            throw {code:403, message:'Auditor role required'};
        }
        return accountId;
    }

    function enforceMyTasksScope() {
        if (myTasks && (params.dictionary !== undefined ||
                (params.report !== undefined && params.report !== 'workflow-history'))) {
            throw {code:403, message:'Only personal workflow history is available'};
        }
    }

    // The UI uses this metadata to set up its columns and workflow selector.
    function describeReportOptions(): ReportingApi.ReportOptions {
        return {
            allowed:true,
            reports:myTasks ? [{id:'workflow-history',title:'My Tasks'}] : config.names,
            workflows:params.workflows === 'true' ? (myTasks ? [] : ReportingApi.workflowCatalog(openidm)) : undefined,
            columns:history ? history.columns.map(function (column) {
                return {
                    header:column.header,
                    visible:column.visible !== false,
                    key:column.path,
                    filterType:myTasks && column.filterType === 'person' ? undefined : column.filterType,
                    filterValues:column.filterValues
                };
            }) : []
        };
    }

    function readReportPage(): ReportingApi.ReportPage {
        var reportId = myTasks ? 'workflow-history' : params.report === undefined ? config.defaultReport : params.report;
        if (typeof reportId !== 'string' || !Object.prototype.hasOwnProperty.call(reports, reportId)) {
            throw {code:400, message:'Unknown report'};
        }
        var report = reports[reportId];
        var sources = report.sources || [report.source!];
        var sourceIndexText = params.sourceIndex === undefined ? '0' : String(params.sourceIndex);
        if (!/^(0|[1-9][0-9]{0,8})$/.test(sourceIndexText) || Number(sourceIndexText) >= sources.length) {
            throw {code:400, message:'Invalid source index'};
        }
        var sourceIndex = Number(sourceIndexText);
        var offset = params.offset === undefined ? '0' : String(params.offset);
        if (!/^(0|[1-9][0-9]{0,8})$/.test(offset)) { throw {code:400, message:'Invalid offset'}; }

        var workflow = params.workflow;
        if (workflow !== undefined && (myTasks || reportId !== 'workflow-history' || typeof workflow !== 'string' ||
                !ReportingApi.workflowCatalog(openidm).some(function (item) { return item.id === workflow; }))) {
            throw {code:400, message:'Unknown workflow'};
        }
        var pageSize = params.pageSize === undefined ? 500 : Number(params.pageSize);
        if (pageSize !== 50 && pageSize !== 500) { ReportingApi.badFilter(); }
        // Scope My Tasks to the signed-in account using the configured reviewer field.
        var personal = myTasks ? {reviewerPath:reviewerPath!, accountId:accountId!} : undefined;
        var queryFilter = ReportingApi.buildFilter(openidm, report, params, personal);
        var includeTasks = reportId === 'workflow-history' && pageSize === 50 && params.taskLinks === 'true';
        var page = ReportingApi.readPage(openidm, report, sources[sourceIndex], Number(offset), pageSize, queryFilter, includeTasks, myTasks);
        var output = ReportingApi.renderRows(openidm, report, page.records);
        var moreSources = sourceIndex + 1 < sources.length;
        return {
            report:reportId,
            filename:report.filename,
            // Table cells and CSV are two representations of the same page.
            columns:report.columns.map(function (column) { return column.header; }),
            rows:output.rows,
            rawRows:output.rawRows,
            links:output.links,
            header:output.header,
            csv:output.csv,
            taskIds:includeTasks ? page.records.map(function (record: Record<string, any>) {
                if (!myTasks) { return ReportingApi.activeTaskId(openidm, record); }
                var assignee = context.security && context.security.authenticationId;
                return record.status === 'pending' && assignee
                    ? ReportingApi.activeTaskId(openidm, record, assignee) : null;
            }) : undefined,
            // The pair identifies where the next table or export request should resume.
            nextOffset:page.hasMore ? Number(offset) + pageSize : (moreSources ? 0 : null),
            nextSourceIndex:page.hasMore ? sourceIndex : (moreSources ? sourceIndex + 1 : null)
        };
    }
}());

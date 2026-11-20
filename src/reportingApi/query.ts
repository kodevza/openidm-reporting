// SPDX-License-Identifier: CDDL-1.1
namespace ReportingApi {
    export function readPage(openidm: IDM, report: ReportProfile, source: string, offset: number,
            pageSize: number, queryFilter: string, includeTasks: boolean, myTasks: boolean) {
        // Explicit projection limits the fields read. No caller-supplied resource or filter.
        var fields = ['_id'];
        if (includeTasks && report.columns.some(function (column) { return column.path === 'processId'; })) {
            fields.push('processId');
        }
        if (includeTasks && myTasks) { fields.push('status'); }
        report.columns.forEach(function (column) {
            if (column.path !== undefined) {
                var field = column.path.split('.')[0];
                if (fields.indexOf(field) < 0) { fields.push(field); }
                const presentation = column.presentation;
                if (presentation) {
                    presentationPaths.forEach(function (key) {
                        var path = presentation[key];
                        if (path && fields.indexOf(path.split('.')[0]) < 0) { fields.push(path.split('.')[0]); }
                    });
                }
            }
        });
        var page = nativeObject(openidm.query(source, {
            _queryFilter:queryFilter, _pageSize:pageSize === 50 ? 51 : 500,
            _pagedResultsOffset:offset, _sortKeys:report.id === 'workflow-history' ? '-createdAt,-_id' : '_id'
        }, fields));
        if (!page || !Array.isArray(page.result)) { throw {code:500, message:'Invalid CSV query response'}; }
        var hasMore = pageSize === 50 ? page.result.length > 50 : page.result.length === 500;
        if (pageSize === 50) { page.result = page.result.slice(0,50); }

        return {records:page.result, hasMore:hasMore};
    }
}

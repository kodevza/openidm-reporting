// SPDX-License-Identifier: CDDL-1.1
namespace ReportingApi {
    function invalidConfig(): never { throw {code:500, message:'Invalid CSV reporting configuration'}; }

    export function loadConfig(openidm: IDM) {
        var config: ReportingConfig = nativeObject(openidm.read('config/custom/reporting'));
        if (!config || !Array.isArray(config.reports) || !config.reports.length) { invalidConfig(); }
        var reports: Record<string, ReportProfile> = {}, names: ReportChoice[] = [];
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
                        report.sources.some(function (source, index) { return report.sources!.indexOf(source) !== index; }))) ||
                    (report.filter !== undefined && (typeof report.filter !== 'string' || !report.filter)) ||
                    !Array.isArray(report.columns) || !report.columns.length) { invalidConfig(); }
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
                const p = column.presentation;
                if (p !== undefined) {
                    if (!p || ['user', 'entraObject'].indexOf(p.kind) < 0 || column.path === undefined) { invalidConfig(); }
                    presentationPaths.forEach(function (field) {
                        var value = p[field];
                        if (value !== undefined && (typeof value !== 'string' || !pathPattern.test(value) ||
                                value.split('.').some(function (key) { return forbiddenKey.test(key); }))) { invalidConfig(); }
                    });
                    if (p.kind === 'entraObject' && (!p.tenantIdPath || !p.sourcePath || !p.objectTypePath)) { invalidConfig(); }
                }
            });
            report.columns.forEach(function (column) {
                if (column.filterType !== undefined && (!column.path || ['text','person','enum','date'].indexOf(column.filterType) < 0 ||
                        (column.filterType === 'person' && (!column.presentation || column.presentation.kind !== 'user')) ||
                        (column.filterType === 'enum' && (!Array.isArray(column.filterValues) || !column.filterValues.length ||
                            column.filterValues.some(function (item) { return !item || typeof item.id !== 'string' || typeof item.title !== 'string'; }))))) { invalidConfig(); }
            });
            reports[report.id] = report;
            names.push({id:report.id, title:report.title});
        });
        if (typeof config.defaultReport !== 'string' ||
                !Object.prototype.hasOwnProperty.call(reports, config.defaultReport)) { invalidConfig(); }

        return {defaultReport:config.defaultReport, reports:reports, names:names};
    }
}

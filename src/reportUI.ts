// SPDX-License-Identifier: CDDL-1.1
// Register the reporting page through the host router; keep implementation in extensions.
declare function define(dependencies: string[], factory: (...dependencies: any[]) => any): void;
define(['jquery', 'org/forgerock/openidm/ui/common/delegates/ResourceDelegate',
    'org/forgerock/commons/ui/common/main/Router',
    'org/forgerock/commons/ui/common/main/Configuration', 'module'], function ($: any, delegate: any, router: any, configuration: any, module: any) {
    return function install() {
        var route = {role:'ui-user,ui-admin', url:'reports/workflow-history/', view:'org/forgerock/openidm/ui/common/workflow/WorkflowHistory'};
        var myTasks = module && module.config().myTasks;
        var personalRoute = {role:'ui-user,ui-admin', url:'reports/my-tasks/', view:route.view};
        if (!router.router) {
            if (!router._workflowHistoryBootstrap) {
                router._workflowHistoryBootstrap = true;
                var initialize = router.init;
                router.init = function () {
                    router.configuration.routes.workflowHistory = route;
                    if (myTasks) { router.configuration.routes.reportingMyTasks = personalRoute; }
                    var result = initialize.apply(router, arguments);
                    install();
                    return result;
                };
            }
            return;
        }
        if (!router.configuration.routes.workflowHistory) {
            router.configuration.routes.workflowHistory = route;
            router.router.route(route.url, 'workflowHistory', function () { router.router.routeCallback(route); });
            if (router.getCurrentHash() === route.url) { router.router.routeCallback(route); }
        }
        if (myTasks && !router.configuration.routes.reportingMyTasks) {
            router.configuration.routes.reportingMyTasks = personalRoute;
            router.router.route(personalRoute.url, 'reportingMyTasks', function () { router.router.routeCallback(personalRoute); });
            if (router.getCurrentHash() === personalRoute.url) { router.router.routeCallback(personalRoute); }
        }
        var nav = $('#mainNavHolder .navbar-nav').first();
        if (!configuration.loggedUser || !nav.length) { return; }
        if (myTasks && !$('#reporting-my-tasks').length) {
            nav.append($('<li id="reporting-my-tasks">').append(
                $('<a href="#reports/my-tasks/">').text('My Tasks')));
        }
        if ($('#governance-report-download').length) { return; }
        delegate.serviceCall({
            url: 'endpoint/governanceReport?capabilities=true',
            errorsHandlers: {
                unauthorized: {status: 401},
                forbidden: {status: 403}
            }
        }).then(function () {
            if ($('#governance-report-download').length) { return; }
            var nav = $('#mainNavHolder .navbar-nav').first();
            nav.append($('<li id="governance-report-download">').append(
                $('<a href="#reports/workflow-history/">').text('Workflow History')));
        }, function () { /* Reporting navigation is available only to authorized users. */ });
    };
});

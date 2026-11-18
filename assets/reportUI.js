"use strict";
define(['jquery', 'org/forgerock/openidm/ui/common/delegates/ResourceDelegate',
    'org/forgerock/commons/ui/common/main/Router'], function ($, delegate, router) {
    return function install() {
        var route = { role: 'ui-user,ui-admin', url: 'reports/workflow-history/', view: 'org/forgerock/openidm/ui/common/workflow/WorkflowHistory' };
        if (!router.router) {
            if (!router._workflowHistoryBootstrap) {
                router._workflowHistoryBootstrap = true;
                var initialize = router.init;
                router.init = function () {
                    router.configuration.routes.workflowHistory = route;
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
            if (router.getCurrentHash() === route.url) {
                router.router.routeCallback(route);
            }
        }
        if ($('#governance-report-download').length) {
            return;
        }
        delegate.getResource('endpoint/governanceReport?capabilities=true').then(function () {
            if ($('#governance-report-download').length) {
                return;
            }
            var nav = $('#mainNavHolder .navbar-nav').first();
            nav.append($('<li id="governance-report-download">').append($('<a href="#reports/workflow-history/">').text('Workflow History')));
        }, function () { });
    };
});

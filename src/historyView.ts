// SPDX-License-Identifier: CDDL-1.1
// The host view owns routing/templates; React owns everything inside the report body.
define(['jquery','org/forgerock/commons/ui/common/main/AbstractView',
    'org/forgerock/openidm/ui/common/delegates/ResourceDelegate',
    'org/forgerock/openidm/ui/common/workflow/WorkflowHistoryReact'], function ($: any, AbstractView: any, delegate: any, app: any) {
    var cleanup: (() => void) | null = null, generation = 0;
    return new (AbstractView.extend({
        template:'templates/reports/WorkflowHistory.html',
        render:function (this: any, args: any, callback: any) {
            var token = ++generation;
            if (cleanup) { cleanup(); cleanup = null; }
            this.parentRender(function () {
                if (token !== generation) { return; }
                var element = document.getElementById('workflow-history-body');
                if (!element) { return; }
                var unmount = app.mount(element, function (uri: string) { return Promise.resolve(delegate.getResource(uri)); });
                var observer = new MutationObserver(function () {
                    if (!document.documentElement.contains(element)) { dispose(); }
                });
                var disposed = false;
                function dispose() {
                    if (disposed) { return; }
                    disposed = true; observer.disconnect(); unmount();
                }
                observer.observe(document.getElementById('wrapper') || document.body, {childList:true, subtree:true});
                cleanup = dispose;
                if (callback) { callback(); }
            });
        }
    }))();
});

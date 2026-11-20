// SPDX-License-Identifier: CDDL-1.1
// The host view owns routing/templates; Preact owns everything inside the report body.
define(['org/forgerock/commons/ui/common/main/AbstractView',
    'org/forgerock/openidm/ui/common/delegates/ResourceDelegate',
    'org/forgerock/openidm/ui/common/workflow/WorkflowHistoryApp',
    'org/forgerock/openidm/ui/common/workflow/WorkflowDelegate'], function (AbstractView: any, delegate: any, app: any, workflow: any) {
    var cleanup: (() => void) | null = null, generation = 0;
    return new (AbstractView.extend({
        template:'templates/reports/WorkflowHistory.html',
        render:function (this: any, args: any, callback: any) {
            var token = ++generation;
            var myTasks = window.location.hash === '#reports/my-tasks/';
            if (cleanup) { cleanup(); cleanup = null; }
            this.parentRender(function () {
                if (token !== generation) { return; }
                var element = document.getElementById('workflow-history-body');
                if (!element) { return; }
                if (myTasks) {
                    var title = document.getElementById('workflow-history-title');
                    var description = title && title.nextElementSibling;
                    if (title) { title.textContent = 'My Tasks'; }
                    if (description) { description.textContent = 'Review workflows assigned to you.'; }
                }
                var unmount = app.mount(element, function (uri: string) {
                    return Promise.resolve(delegate.getResource(myTasks ? uri + '&myTasks=true' : uri));
                }, myTasks, myTasks ? function (id: string) {
                    return new Promise<void>(function (resolve, reject) {
                        workflow.completeTask(encodeURIComponent(id), {decision:'reject'}, resolve, reject);
                    });
                } : undefined);
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

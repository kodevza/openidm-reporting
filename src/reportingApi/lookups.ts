// SPDX-License-Identifier: CDDL-1.1
namespace ReportingApi {
    export class IdentityLookup {
        private readonly users: Record<string, any> = {};
        private readonly principals: Record<string, any> = {};

        constructor(private readonly openidm: IDM) {}

        workflowUser(localId: ReportCell, raw: ReportCell, tenant: ReportCell) {
            var key = JSON.stringify([localId, raw, tenant]);
            if (!Object.prototype.hasOwnProperty.call(this.users, key)) {
                var filter = localId ? '/_id eq ' + JSON.stringify(localId) :
                    '(/userName eq ' + JSON.stringify(raw) + ' or /_id eq ' + JSON.stringify(raw) +
                    ' or /entraOidcSubject eq ' + JSON.stringify(raw) + ')';
                if (tenant) { filter = '(' + filter + ') and /entraTenantId eq ' + JSON.stringify(tenant); }
                var matches = nativeObject(this.openidm.query('managed/user', {_queryFilter:filter, _pageSize:2},
                    ['givenName','sn','displayName','entraObjectId','entraTenantId']));
                if (!matches || !Array.isArray(matches.result)) { throw {code:500, message:'Invalid workflow identity query response'}; }
                this.users[key] = matches.result.length === 1 ? matches.result[0] : null;
            }
            return this.users[key];
        }

        servicePrincipal(objectId: string, tenantId: string) {
            var key = JSON.stringify([objectId, tenantId]);
            if (!Object.prototype.hasOwnProperty.call(this.principals, key)) {
                var matches = nativeObject(this.openidm.query('managed/entraServicePrincipal', {
                    _queryFilter:'/sourceId eq ' + JSON.stringify(objectId) + ' and /tenantId eq ' + JSON.stringify(tenantId), _pageSize:2
                }, ['sourceId','tenantId','appId','servicePrincipalType']));
                if (!matches || !Array.isArray(matches.result)) { throw {code:500, message:'Invalid service principal query response'}; }
                this.principals[key] = matches.result.length === 1 ? matches.result[0] : null;
            }
            return this.principals[key];
        }
    }

    export function peopleDictionary(openidm: IDM, params: Record<string, any>): PeopleDictionary {
        var search = params.search === undefined ? '' : params.search;
        var peopleOffset = params.peopleOffset === undefined ? '0' : String(params.peopleOffset);
        if (typeof search !== 'string' || search.length > 100 || !/^(0|[1-9][0-9]{0,8})$/.test(peopleOffset)) { badFilter(); }
        var words = search.trim().split(/\s+/).filter(function (word: string) { return !!word; });
        if (words.length > 5) { badFilter(); }
        var peopleFilter = words.map(function (word: string) {
            return '(' + ['givenName','sn','displayName','userName','entraUserPrincipalName'].map(function (field) {
                return '/' + field + ' sw ' + JSON.stringify(word);
            }).join(' or ') + ')';
        }).join(' and ') || 'true';
        var people = nativeObject(openidm.query('managed/user', {_queryFilter:peopleFilter, _pageSize:21,
            _pagedResultsOffset:Number(peopleOffset), _sortKeys:'givenName,sn,_id'},
            ['_id','givenName','sn','displayName','userName','entraUserPrincipalName']));
        if (!people || !Array.isArray(people.result)) { throw {code:500, message:'Invalid people dictionary response'}; }
        return {items:people.result.slice(0,20).map(function (user: any): PeopleDictionary['items'][number] {
            var name = [user.givenName,user.sn].filter(function (part) { return typeof part === 'string' && part.trim(); }).join(' ').trim();
            return {id:user._id, title:name || user.displayName || user.userName || user._id,
                description:user.entraUserPrincipalName || user.userName || ''};
        }), nextOffset:people.result.length > 20 ? Number(peopleOffset) + 20 : null};
    }

    export function workflowCatalog(openidm: IDM): ReportChoice[] {
        var definitions = nativeObject(openidm.query('workflow/processdefinition', {_queryId:'filtered-query'}, ['key', 'name', 'version']));
        if (!definitions || !Array.isArray(definitions.result)) { throw {code:500, message:'Unable to load workflow definitions'}; }
        var seen: Record<string, boolean> = {}, workflows: ReportChoice[] = [];
        definitions.result.sort(function (a: any, b: any) { return Number(b.version || 0) - Number(a.version || 0); }).forEach(function (definition: any) {
            if (typeof definition.key !== 'string' || Object.prototype.hasOwnProperty.call(seen, definition.key)) { return; }
            seen[definition.key] = true;
            workflows.push({id:definition.key, title:definition.name || definition.key});
        });
        return workflows.sort(function (a, b) { return a.title.localeCompare(b.title); });
    }

    export function activeTaskId(openidm: IDM, record: Record<string, any>): string | null {
        var processId = record.processId || record._id;
        if (typeof processId !== 'string' || !processId.trim()) { return null; }
        try {
            var tasks = nativeObject(openidm.query('workflow/taskinstance', {
                _queryId:'filtered-query', processInstanceId:processId
            }, ['_id']));
            if (tasks && Array.isArray(tasks.result) && tasks.result.length === 1) {
                var taskId = tasks.result[0]._id;
                return typeof taskId === 'string' && taskId.trim() ? taskId : null;
            }
        } catch (error) {
            // Keep the persisted history available if the workflow engine is unavailable.
        }
        return null;
    }
}

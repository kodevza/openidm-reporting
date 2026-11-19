// SPDX-License-Identifier: CDDL-1.1
namespace ReportingApi {
    export class EntraLinks {
        private readonly uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        constructor(private readonly identities: IdentityLookup) {}

        // Fixed portal targets; arbitrary stored URLs are never rendered as hyperlinks.
        object(type: ReportCell, objectId: any, tenantId: any): string | null {
            if (typeof objectId !== 'string' || typeof tenantId !== 'string' || !this.uuid.test(objectId) || !this.uuid.test(tenantId)) { return null; }
            var blades: Record<string, string> = {
                user:'Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/',
                servicePrincipal:'Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/',
                group:'Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/'
            };
            if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(blades, type)) { return null; }
            return 'https://entra.microsoft.com/' + encodeURIComponent(tenantId) + '/#view/' + blades[type] + encodeURIComponent(objectId);
        }

        servicePrincipal(objectId: any, tenantId: any): string | null {
            var base = this.object('servicePrincipal', objectId, tenantId);
            if (!base) { return null; }
            var principal = this.identities.servicePrincipal(objectId, tenantId);
            if (!principal || String(principal.sourceId).toLowerCase() !== objectId.toLowerCase() ||
                    String(principal.tenantId).toLowerCase() !== tenantId.toLowerCase() ||
                    typeof principal.appId !== 'string' || !this.uuid.test(principal.appId) ||
                    typeof principal.servicePrincipalType !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(principal.servicePrincipalType)) { return null; }
            return base + '/appId/' + encodeURIComponent(principal.appId) +
                '/preferredSingleSignOnMode~/null/servicePrincipalType/' + encodeURIComponent(principal.servicePrincipalType) + '/fromNav/';
        }
    }
}

# OpenIDM Reporting module

Independent read-only reporting extension. TypeScript sources, generated JavaScript,
configuration, UI, installer and tests live in this repository. The installer uses
supported custom endpoints and navigation extensions; it does not patch OpenIDM
Java sources, bundled UI JavaScript or default templates.

## Workflow history

**Workflow History** opens a full page in the main content area of both Admin
and Self Service. Its **Workflow** dropdown lists the latest definition of each
workflow available in OpenIDM, including workflows with no saved history. Select
a workflow to filter its history, or choose **All workflows**. **Download CSV**
exports the complete result for that selection. The downloaded CSV begins with
**Selected Workflow** (name) and **Workflow Key** metadata rows, followed by the
column header and records. **All workflows** is explicitly recorded for combined
exports, including exports with no matching records. The table
and CSV use the same server-side projection. Only `openidm-auditor` and
`openidm-admin` can access either representation. All auditors can access all
configured reports; ordinary users cannot access the reporting endpoint.

The default `workflow-history` report uses a common contract rather than
service-principal-specific columns:

| Field | Meaning |
| --- | --- |
| `_id` / `processId` | Persisted process-instance ID |
| `processType` | Stable workflow definition key |
| `recordType` | Business operation, e.g. `ownership_assignment` or `recertification` |
| `subject` | Identifier of the object under review, e.g. Entra service principal **Object ID** |
| `subjectName`, `subjectType` | Name captured when starting the workflow and object type |
| `source`, `tenantId` | Originating system and tenant; qualify the subject across sources |
| `reviewer`, `requester` | Nominated reviewer and initiating workflow identity |
| `reason`, `status` | Purpose and persisted outcome/current state |
| `createdAt`, `decidedAt`, `decidedBy` | Start time, decision time and actual deciding identity |

The Entra owner workflow writes these fields into its existing authoritative
`managed/entraOwnerRequest` record. It also retains its internal assignment fields.
Completed records remain queryable after the engine finishes the process.
Client-supplied task variables are not the authority for the report.

Future workflows can persist the same contract in their own protected collection.
Add that collection to the `sources` list of `workflow-history` to include it in
one table and one CSV without changing the engine or UI. Each process run should
have its own record. A workflow must record decisions and timestamps on its
server side; reporting does not infer these from BPMN definitions.

The existing owner-assignment workflow is labeled `ownership_assignment`, not
`recertification`. Historic records and running instances created by older BPMN
versions retain their original data; newly added metadata can be empty in those
rows. This upgrade does not rewrite past evidence, infer past names/IDs from
current inventory, or turn old assignments into certifications. New starts must
use the latest workflow definition. Engine-only cancellation/deletion does not
update the persisted request status automatically.

## Server-side column filters

The page offers a **Column filters** panel. Filters are ANDed with the selected
workflow and administrator-configured source filter. They apply to the entire
collection before sorting/paging; the browser never downloads the history to
filter it locally. The table requests 50 rows (the backend reads at most 51 to
detect a next page). CSV uses the same immutable filter selection in 500-row
pages. Offset paging remains a live query, not a transactional snapshot.

- **Subject ID**, **Subject Name**, **Process ID** and **Reason** accept prefix
  text ("Starts with…"). Prefix matching avoids an unrestricted contains scan.
- **Reviewer**, **Requested By** and **Decided By** use searchable person
  dictionaries, showing names plus UPN/username to distinguish duplicate names.
  A dictionary request reads at most 21 users, returns 20 and exposes **More
  people** if another page exists. Search is debounced and performed remotely.
  Selecting a person sends the stable local account ID. Reviewer filters use the
  recorded local ID; actor filters match known account IDs, usernames, OIDC
  subjects and previous workflow aliases. Missing/deleted people cannot currently
  be selected through the active account dictionary.
- **Status** is a repository-defined dictionary: Pending, Accepted, Rejected,
  Canceled. Configure its `filterValues` in `assets/custom-reporting.json`.
- **Started At** / **Decided At** accept inclusive From/To local date/time ranges,
  converted to UTC ISO timestamps before querying. Reversed ranges are rejected.

Column `filterType` is `text`, `person`, `enum` or `date`. Only configured paths
are accepted. The backend validates values, escapes literals and rejects unknown
fields/operators; callers cannot supply arbitrary query expressions. The API
accepts a JSON `filters` parameter keyed by configured column paths, for example:

```json
{"subject":"ca2242", "status":"accepted", "reviewer":"LOCAL_ACCOUNT_ID"}
```

The protected dictionary endpoint is
`endpoint/governanceReport?dictionary=people&search=NAME&peopleOffset=0`.
It returns `items` (id/title/description) and `nextOffset`. It queries the local
user collection only, never scans workflow rows to build choices and does not
contact Entra. Dictionary access uses the same auditor/admin authorization.

`assets/history-indexes.json` defines additive OrientDB indexes for workflow,
status, participant IDs, subjects, dates and dictionary name searches. Apply them
with `--install-indexes`; existing indexes and classes are preserved. Other
repository implementations require their equivalent indexes. A local EXPLAIN
probe confirmed use of the workflow/date composite index; this is not a benchmark
or a guarantee that every filter combination can avoid sorting or scanning.

Opt-in paging/filter validation creates 53 disposable local history rows plus one
managed user, verifies matches outside the first page and removes its fixtures:

```sh
OPENIDM_USERNAME=openidm-admin OPENIDM_PASSWORD='...' python3 tests/live_filters.py
```

## Identity names and Microsoft Entra links

Reviewer, Requested By and Decided By show the synchronized user's given name and
surname (falling back to display name, then the original recorded identifier).
Names are resolved from the current local `managed/user` inventory; they are not
historical name snapshots. No Microsoft Graph calls or history rewrites occur.
The reviewer uses the authoritative stored local account ID; deciding/requesting
actors are matched by exact username, local ID or bound OIDC subject, scoped to
the record's tenant when present. Missing, ambiguous or mismatched users retain
the recorded identifier without a link. Empty decisions stay empty.

Entra users link to their user overview using their **Entra Object ID**, never
an OIDC subject or local OpenIDM ID. Subject links use the persisted source,
object type, subject Object ID and tenant. Service principal links additionally
resolve the exact synchronized inventory object and include its `appId` and actual
`servicePrincipalType` (including `ManagedIdentity`) in the enterprise application
blade URL. Missing or ambiguous inventory leaves the Subject as plain text,
rather than generating an incomplete portal link. Currently supported subject types are
`user`, `servicePrincipal` and `group`; unsupported sources/types or invalid IDs
remain plain text. Links open in a new tab and require the viewer's normal Entra
sign-in and permissions. The workflow definition does not change.

Presentation rules are repository-configured per column, e.g.:

```json
{
  "header": "Reviewer",
  "path": "reviewer",
  "presentation": {"kind":"user", "localIdPath":"newOwnerId", "tenantIdPath":"tenantId"}
}
```

`kind: "entraObject"` uses `tenantIdPath`, `sourcePath` and `objectTypePath`;
the column's normal `path` supplies the external Object ID. Only administrator
configuration can select these paths. User lookups project names and Entra IDs
only and are cached within the report page. The API's `rows` and CSV contain
resolved labels, `rawRows` retain the original projected identifiers, and `links`
contains the corresponding portal targets or null. Tooltips preserve original
identities. UI values are rendered as text and only fixed Entra portal links are
allowed.

Portal routes follow Microsoft's [MSIdentityTools report exporter](https://github.com/AzureAD/MSIdentityTools/blob/main/src/Export-MsIdAppConsentGrantReport.ps1),
with the [tenant-specific admin center URL](https://learn.microsoft.com/en-us/entra/external-id/redemption-experience#redemption-process-through-a-direct-link).

## Column preferences

**Configure columns** expands an inline panel of column checkboxes. Changes apply
immediately and are remembered in this browser's local storage. **Reset to defaults**
restores the deployed repository defaults. At least one column stays visible.

Set `visible: true` or `visible: false` on each column in the `workflow-history`
profile in [`assets/custom-reporting.json`](assets/custom-reporting.json), then
install with `--sync-defaults --reload` to apply those defaults. For example:

```json
{"header":"Subject", "path":"subject", "visible":true}
```

The initial visible columns are Subject, Subject Name, Reviewer, Status,
Started At, Decided By and Decided At. Columns without `visible` default to visible.
Existing browser preferences take priority until reset; new/renamed columns
invalidate saved preferences. Visibility affects the table only: CSV exports all
configured columns, with the selected workflow filter. Column visibility is a
presentation preference, not a field-level authorization boundary.

## Develop and validate

```sh
npm ci
npm run typecheck
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile install.py export.py tests/live.py
```

`src/reportEndpoint.ts`, `src/reportUI.ts` and the small `src/historyView.ts`
host adapter compile in strict mode to ES5 JavaScript. The endpoint remains
compatible with OpenIDM's scripting engine.

`src/react/` is a standalone **React + TypeScript + TanStack React Table 9**
application. TanStack owns column filter state, visibility, headers/cells and
manual pagination. Filtering/pagination stay on the server. The app uses the
host's existing visual styles and occupies the full-width report body.

`build-react.mjs` bundles React, React DOM and TanStack into the scoped
`assets/historyApp.js` AMD module (ES2020, for modern browsers). It does not depend
on or replace OpenIDM's bundled React version. Third-party license notices are
included in `assets/historyApp.LICENSE.txt`. The host mounts one React root on
entry and unmounts it when the view DOM is removed; effects ignore late responses
and an in-progress export is canceled when navigating away. The navigation route,
authorization, custom endpoint and repository-default columns are unchanged.

Edit TypeScript/TSX and run `npm run build` before installation. Generated assets
are versioned so the installed host needs neither Node nor a compiler. Tests use
React Testing Library with the actual TanStack adapter, cover the host mounting
lifecycle, and check CSV metadata plus filtered paging.

Before committing, install pre-commit and Go (for the pinned Gitleaks hook), then:

```sh
pre-commit install --install-hooks
pre-commit run gitleaks --all-files
```

Keep credentials in environment variables or ignored local `.env` files. Local
exports and private key files are ignored.

## Install into the local Docker deployment

First update the workflow schema and definition from the companion projects:

```sh
cd ../openidm
python3 scripts/install-workflow.py
cd ../openidm-reporting
python3 install.py --check --sync-defaults --install-indexes
OPENIDM_PASSWORD='...' python3 install.py --sync-defaults --install-indexes --reload
```

The workflow installer needs `OPENIDM_PASSWORD` or prompts for it. Reporting
installation uses Docker. `--reload` additionally uses administrator credentials
to compile the updated script immediately, avoiding stale endpoint code; without
it a later host restart activates changed scripts. It updates
`endpoint/governanceReport`, its script, the report configuration and the Admin
and Self Service navigation modules, page template and startup registration.
The startup loader is composed into `extension/index.html`; direct links and
page reloads register the report route before routing begins. Default distribution
assets are preserved. Reload the browser after installing.
Navigation template extensions must already exist, e.g. from the Entra user-menu
installer. The workflow installer merges new protected history fields into
existing schemas and preserves custom properties.

A missing `custom-reporting.json` is created from the default. On upgrade the
installer adds a missing `workflow-history` profile without replacing existing
profiles. It switches the default only for the unchanged original single-profile
configuration. An administrator's existing `workflow-history` profile is preserved by default.
Pass `--sync-defaults` to explicitly replace that profile with the repository
version, including English column labels and default visibility.
Changed deployment files are backed up with a manifest under
`/opt/openidm/workflow-backups/reporting-*`. Restore the manifest's numbered
backups (remove files whose previous backup is null) to roll back.

Create the internal auditor role if necessary:

```sh
OPENIDM_PASSWORD='...' python3 install.py --create-role
```

Assign approved users `repo/internal/role/openidm-auditor` via `managed/user.authzRoles`.
The installer never assigns roles to real users. Sign out and in after changing
roles. Preserve the deployment's configuration, extensions and repository across
container replacement using volumes or an image.

## Configure reports

Edit `/opt/openidm/conf/custom-reporting.json`, exposed as
`config/custom/reporting`. A report has an ID, title, filename, one `source` or a
nonempty list of unique `sources`, an optional OpenIDM query `filter`, and ordered
columns. All sources in one report use the same column projection and filter.
For example:

```json
{
  "defaultReport": "workflow-history",
  "reports": [{
    "id": "workflow-history",
    "title": "Workflow history",
    "filename": "workflow-history.csv",
    "sources": ["managed/entraOwnerRequest", "managed/applicationCertification"],
    "filter": "true",
    "columns": [
      {"header": "Process", "path": "_id"},
      {"header": "Subject", "path": "subject"},
      {"header": "Source", "path": "source"},
      {"header": "Status", "path": "status"},
      {"header": "Decided by", "path": "decidedBy"},
      {"header": "Decided at", "path": "decidedAt"}
    ]
  }]
}
```

Replace `managed/applicationCertification` with a real persisted collection before
using this example. Sources must support `openidm.query`, projection and paging.
Allowed namespaces are `managed`, `repo`, `audit` and `workflow`. Each column has
one dotted `path` or one scalar constant `value`. Missing/null values are empty;
structured values are JSON in a cell. Callers cannot supply sources, filters or
fields. Invalid profiles fail closed before reading records. UI values use text
rendering; CSV cells use quoted semicolon-separated values and formula protection.
The legacy `ownership-history` API profile remains available for existing clients;
the navigation exposes a single Workflow History page.

## API and programmatic export

```text
GET /openidm/endpoint/governanceReport?capabilities=true&workflows=true
GET /openidm/endpoint/governanceReport?report=workflow-history&workflow=servicePrincipalOwner&sourceIndex=0&offset=0
```

The workflow catalog is returned only with `workflows=true`, with definition
versions deduplicated by key. A supplied `workflow` must match a known key and
adds a server-side `processType` filter to each configured source. A workflow
without contract-compatible history returns an empty result.

Pages contain `report`, `filename`, CSV `header` and `csv`, table `columns` and
`rows`, plus `nextOffset` and `nextSourceIndex`. A null `nextOffset` ends the
report. Otherwise pass both returned cursor values to request the next page.
The offset resets to zero when moving to the next source. Pages contain up to
500 rows for export or 50 rows for the table. Workflow history is sorted by
`createdAt` descending and `_id` descending **within each source**; sources are visited in
configuration order. This is not a global chronological sort or a transactional
snapshot. Concurrent changes during an export can cause missing/duplicate rows.
Do not change the report configuration during export.

```sh
export OPENIDM_USERNAME='auditor-account'
export OPENIDM_PASSWORD='...'
python3 export.py --report workflow-history --output exports/workflow-history.csv
```

The Python standard-library CLI follows both cursor fields and atomically writes
UTF-8 CSV with BOM and mode 0600. A failed export preserves an existing destination.
Use a dedicated auditor identity for scheduled exports.

Opt-in live authorization/export tests require the installed module and admin
credentials; they create and remove only disposable internal accounts:

```sh
OPENIDM_PASSWORD='...' python3 tests/live.py
```

Business-data joins, SLA calculations, historical reconstruction and aggregate analytics remain
outside this lightweight projection engine. Persistent workflow records are the
source of historical evidence.

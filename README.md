# OpenIDM Reporting

Reporting extension for OpenIDM Admin and Self Service. It adds workflow history,
CSV export and a personal task view through a custom endpoint and UI extensions.

## Use the reports

- **Workflow History** is available to `openidm-auditor` and `openidm-admin`.
  Choose **All workflows** or select a workflow. The list shows the latest
  definition for each workflow key, even when its history is empty.
- **My Tasks** is available in Self Service to signed-in managed users. The
  server scopes the table and CSV to the user's local reviewer ID and includes
  all statuses. The global workflow list and people picker are unavailable here.
- **Download CSV** exports all configured columns and matching rows, including
  rows on other pages. UI exports start with **Selected Workflow**
  and **Workflow Key** metadata rows.
- **Configure columns** saves visibility in the current browser. Use **Reset to
  defaults** to restore the deployed settings.

### Filter the table

Open a filter from its column header. Active filters appear above the table and
still apply when a column is hidden. **Clear filters** removes them all.
The server combines column filters with the workflow selection before paging.

| Columns | Filter |
| --- | --- |
| Subject, Subject Name, Process ID, Reason | Starts with |
| Reviewer, Requested By, Decided By | Search the local directory and select a person |
| Status | Pending, Accepted, Rejected or Canceled |
| Started At, Decided At | Inclusive local date/time range |

Reviewer, requester and decision-maker names come from the current local user
directory. If a lookup fails, the report shows the recorded identifier.
When enough data is available, people and subjects link to Microsoft Entra.
OpenIDM process and task links use the viewer's existing Admin permissions.

### Reject ownership tasks in bulk

In **My Tasks**, select individual pending tasks or choose **Select all pending
tasks** to select eligible tasks across all pages, including rows hidden by
filters. Choose **Reject selected** and confirm. OpenIDM processes each decision
through its standard task action. Failed tasks stay selected for retry. A
rejection can advance the workflow to the next reviewer.

## Install in the local Docker PoC

> [!IMPORTANT]
> `install.py` is for the local Docker proof of concept. Use a separate installer
> tailored to your production deployment.

The local OpenIDM container must be running and have navigation template
extensions for Admin and Self Service, such as those added by the Entra user-menu
installer. From this repository, update the workflow schema and definition using
the sibling `openidm` checkout, then build and check the reporting installation.

```sh
(cd ../openidm && python3 scripts/install-workflow.py)
npm ci
npm run build
python3 install.py --check
```

Run the installer with `OPENIDM_PASSWORD` set to an OpenIDM administrator's
password. `--reload` compiles the updated endpoint immediately. Reload the
browser after installation.

```sh
python3 install.py --reload
```

The installer adds a missing `workflow-history` profile and preserves existing
customizations by default. To replace that profile with the repository version
and make it the default, add `--sync-defaults`. Include the same flag with
`--check` to preview that operation. Changed files are backed up with a manifest
under `/opt/openidm/workflow-backups/reporting-*`.
To roll back, restore the files listed in `manifest.json` from their numbered
backups. A `null` backup marks a file that was created during installation.

If needed, run `python3 install.py --create-role` with the administrator
password set. Assign approved users `repo/internal/role/openidm-auditor` through
`managed/user.authzRoles`. Users must sign in again to pick up the new role.

## Configure reports

The repository defaults are in [assets/custom-reporting.json](assets/custom-reporting.json).
Edit `/opt/openidm/conf/custom-reporting.json` in the deployment. Each profile
defines an ID, title, CSV filename, a `source` or list of `sources`, an optional
OpenIDM query `filter` and ordered `columns`.

- Sources must support OpenIDM queries, projection and paging. The supported
  namespaces are `managed`, `repo`, `audit` and `workflow`.
- Each column has a dotted `path` or a scalar `value`. Set `visible: false`
  to hide it by default. CSV includes hidden columns.
- Set `filterType` to `text`, `person`, `enum` or `date` for filterable
  paths. Configure enum choices with `filterValues`.
- The Reviewer column's `presentation.localIdPath` supplies the local ID used
  to scope **My Tasks**.

### Workflow history records

The default `workflow-history` profile reads `managed/entraOwnerRequest`.
To include another workflow, persist one record per process run in a protected
collection and add that collection to `sources`. All sources share the same
column projection and configured filter.

| Fields | Meaning |
| --- | --- |
| `_id`, `processType`, `recordType` | Process instance ID, workflow key and business operation |
| `subject`, `subjectName`, `subjectType` | Reviewed object's ID, name at workflow start and type |
| `source`, `tenantId` | Originating system and tenant |
| `reviewer`, `requester`, `reason`, `status` | Participants, purpose and state |
| `createdAt`, `decidedAt`, `decidedBy` | Start time, decision time and deciding identity |

The workflow records decisions and timestamps on the server. Older records can
have empty metadata. Engine-only cancellation or deletion leaves the persisted
status as it was. The existing owner workflow uses `ownership_assignment` as
its record type. The legacy `ownership-history` API profile is also available.

## API and programmatic export

```text
GET /openidm/endpoint/governanceReport?capabilities=true&workflows=true
GET /openidm/endpoint/governanceReport?report=workflow-history&workflow=servicePrincipalOwner&sourceIndex=0&offset=0
GET /openidm/endpoint/governanceReport?dictionary=people&search=NAME&peopleOffset=0
```

The `workflow` parameter is optional. Pass column filters as a JSON object in
the `filters` query parameter, keyed by configured paths, for example
`{"subject":"ca2242","status":"accepted"}`. Use `myTasks=true` for personal
history as a managed user.

For CSV, use the first page's `header` and join it with each nonempty `csv`
fragment using CRLF line breaks. The API returns semicolon-delimited fields.
Pass both `nextSourceIndex` and `nextOffset` back as `sourceIndex` and `offset`
until `nextOffset` is null. The default page size is 500. Use `pageSize=50`
for table pages. Workflow history sorts by `createdAt` and then `_id`, both
descending within each source. Sources are read in configuration order.
Concurrent changes can cause duplicate or skipped rows during export.

## Develop and validate

```sh
npm ci
npm run lint
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile install.py tests/live.py tests/live_filters.py
```

`npm test` type-checks the TypeScript, builds the endpoint and Preact UI,
and runs the Node tests. Generated deployment files in `assets/` are ignored by
Git. To enable the Gitleaks and ESLint commit hooks, install pre-commit and Go,
then run `pre-commit install --install-hooks`.

The live tests require the installed module and administrator credentials
(`OPENIDM_PASSWORD`, with optional `OPENIDM_USERNAME` and `OPENIDM_URL`).
They create and clean up disposable fixtures in the local deployment.

```sh
python3 tests/live.py
python3 tests/live_filters.py
```

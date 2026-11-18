# OpenIDM Reporting module

Before committing, install [pre-commit](https://pre-commit.com/#install) and Go
(required to build the pinned [Gitleaks](https://github.com/gitleaks/gitleaks)
hook), then activate the secret scanner in each checkout:

```sh
pre-commit install --install-hooks
```

The hook scans staged changes and blocks commits when it detects secrets.
To check staged changes manually, run `pre-commit run gitleaks --all-files`.
Keep real credentials in environment variables or ignored local `.env` files.
Local exports, reports and private key files are also ignored.

Independent reporting extension. This directory is separate from the OpenIDM
source checkout; it owns its endpoint, UI module, installer and tests. No OpenIDM
Java sources, bundled JavaScript or default templates are patched.

The module is installed in the local OpenIDM Docker deployment. The internal
`openidm-auditor` role exists; the installer does not assign it to any real user.

Integration boundary: the installer registers its custom endpoint, adds a narrow
rule to the deployment's `script/access.js`, and attaches a module loader to the
existing navigation extension. These are backed-up deployment registrations.
It does not edit the OpenIDM source checkout, Java bundles, bundled UI JavaScript
or default UI templates. Module implementation and tests remain in this directory.

# Auditor CSV export

A logged-in auditor can click **Raport CSV** in the navigation bar (Self Service
or Admin). No reporting dashboard is required. The server permits only
`openidm-auditor` and `openidm-admin`; ordinary authenticated users cannot access
the endpoint, including by calling it directly.

Install into the running local Docker deployment:

```sh
python3 install.py --check
python3 install.py
```

The installer preserves the current navigation extensions and access rules and
backs up changed files under `/opt/openidm/workflow-backups/reporting-*`.
Reload the browser after installation. Navigation templates must already exist
in the extension directories (the Entra user-menu installer provides them).

To create the internal role, supply administrator credentials through the
`OPENIDM_PASSWORD` environment variable and run:

```sh
python3 install.py --create-role
```

Assign the internal authorization role `openidm-auditor` to approved users through
`managed/user.authzRoles` (relationship `_ref`:
`repo/internal/role/openidm-auditor`). Do not grant administrator access.
Sign out and sign in after assigning a role. Existing Entra authorization mapping
retains non-administrator roles from `authzRoles`; Entra access-group membership
is still required. The installer never grants a role to any user automatically.

The CSV includes one row per `entraOwnerRequest`: process ID, local principal ID,
principal name, previous/new owner, requester, reason, status, creation/decision
times and decision actor. It uses UTF-8 with BOM, semicolons, quoted fields and
spreadsheet formula protection. Records are read in pages of 500; the browser
assembles the download. It is a live export, not a database snapshot, so changes
during a long export may affect the result.

This reports **ownership assignment history**. `decidedAt` means ownership
acceptance/rejection, not periodic recertification. `recordType` explicitly says
`ownership_assignment`. No last-recertification date is fabricated. A dedicated
recertification process/data model is needed before that field can be reported.
Workflow task timings and campaign metrics are outside this first export.

Validation:

```sh
node --test tests/report.test.cjs
```

Live verification (requires administrator credentials in OPENIDM_PASSWORD):

```sh
python3 tests/live.py
```

The live test creates two disposable internal users, checks anonymous/ordinary/
auditor/admin access, then deletes only its fixtures using their current revisions.
It does not create Graph objects or assign a role to any existing user.

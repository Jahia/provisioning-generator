# provisioning-generator

Jahia OSGi module that generates a provisioning ZIP archive of all currently active Jahia modules (JARs + YAML manifest) and stores it in JCR. Admin UI at `/jahia/administration/provisioningGenerator`.

## Key Facts

- **artifactId**: `provisioning-generator` | **version**: `2.0.1-SNAPSHOT`
- **Java package**: `org.community.provisioninggenerator`
- **jahia-depends**: `serverSettings,graphql-dxm-provider,default`
- No Blueprint/Spring — pure OSGi DS

## Architecture

| Class | Role |
|-------|------|
| `ProvisioningGeneratorService` | Core logic; `AtomicBoolean generating` rejects concurrent calls; `generate(tmpContentDiskPath)` builds the ZIP and returns the `File`; `generate(path, handler)` / `generateAsync(path, handler)` keep the lock while the handler stores the file |
| `BundleInstall` | Value object representing one bundle entry in the archive; constructor prefixes the entry name with `file://<tmpContentDiskPath>/` and exposes `installBundle` + `autoStart=true` |
| `GenerateCommand` | Karaf shell command `provisioning-generator:generate` that calls the service and logs the generated path |
| `ProvisioningGeneratorGraphQLExtensionsProvider` | Registers the GraphQL extensions with `graphql-dxm-provider` |
| `ProvisioningGeneratorQueryExtension` | GraphQL queries |
| `ProvisioningGeneratorMutationExtension` | GraphQL mutations |

Generated archive JCR path: `/sites/systemsite/files/provisioning-generator/provisioning-export.zip` (constants `JCR_FOLDER` / `JCR_FILENAME` / `ARCHIVE_JCR_PATH` in `ProvisioningGeneratorMutationExtension`).
Temp ZIP is written to `SettingsBean#getTmpContentDiskPath()` as `modulesExport<timestamp>.zip`, copied into JCR via `JCRNodeWrapper#uploadFile`, then deleted (`ProvisioningGeneratorMutationExtension#storeArchive`).

`generate()` runs as a system session on `EDIT_WORKSPACE`, iterates `JahiaTemplateManagerService#getAvailableTemplatePackages()` filtered by `isActiveVersion`, runs a JCR-SQL2 query against `[jnt:moduleManagementBundle]` under `/module-management/` for each module, and writes each JAR plus a `provisioning.yaml` manifest into a ZIP using `ZipOutputStream`. Zip entry names are sanitized (rejects `..`, `/`, `\`, leading `/`) to harden against zip-slip.

## GraphQL API

| Operation | Name | Notes |
|-----------|------|-------|
| Query | `provisioningGeneratorIsGenerating` → Boolean | Reads the service's `generating` flag |
| Query | `provisioningGeneratorArchiveInfo` → `{createdAt}` | Returns `null` if archive doesn't exist in JCR |
| Mutation | `provisioningGeneratorGenerate(async: Boolean)` → Boolean | Sync by default; `async: true` starts a background generation (returns `false` if one is running); stores result in JCR |
| Mutation | `provisioningGeneratorDelete` → Boolean | Removes the archive node from JCR |

All require `admin` permission.

## Build

```bash
mvn clean install
yarn build
yarn lint
```

- Admin route target: `administration-server-systemComponents:999`
- CSS prefix: `pg_`
- Route key: `provisioningGenerator`

## Tests (Cypress Docker)

```bash
cd tests
cp .env.example .env
yarn install
./ci.build.sh && ./ci.startup.sh
```

- Tests:
  - `tests/cypress/e2e/01-provisioningGenerator.cy.ts` — GraphQL-level flow (generate, poll `isGenerating`, archive info, delete)
  - `tests/cypress/e2e/02-provisioningGeneratorUI.cy.ts` — Admin UI flow (buttons, download link, delete confirmation); hardened against cold-start and batched Apollo requests
- Admin path: `/jahia/administration/provisioningGenerator`

## Gotchas

- `AtomicBoolean generating` in `ProvisioningGeneratorService` is an exclusive lock: a second generation is rejected (`IllegalStateException` for sync calls, `false` for `generateAsync`). When called through the mutation, the flag stays `true` until the JCR write and temp-file cleanup (`ArchiveHandler`) have completed, so `isGenerating == false` means the archive node is up to date.
- `provisioningGeneratorGenerate` is **synchronous by default** (backward compatible) and blocks the request thread for the whole generation. Behind a reverse proxy with a short timeout (e.g. 30s) this ends in a 504 HTML page while the server keeps working. Pass `async: true` (the admin UI does) to run it on the service's single-thread executor and return immediately; then poll `provisioningGeneratorIsGenerating`.
- If the archive JCR node doesn't exist at `archiveInfo` query time, `null` is returned (not an error) — the UI uses this to show/hide the download button.
- The Karaf command `provisioning-generator:generate` does NOT copy the file into JCR; it only writes to `tmpContentDiskPath` and logs the absolute path. JCR persistence happens exclusively through the GraphQL mutation.
- CSS Modules: match in Cypress with `[class*="pg_..."]`.

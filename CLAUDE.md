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
| `ProvisioningGeneratorService` | Core logic; `volatile boolean generating` guards concurrent calls; `generate(tmpPath)` builds the ZIP |
| `BundleInstall` | Value object representing one bundle entry in the archive |
| `ProvisioningGeneratorQueryExtension` | GraphQL queries |
| `ProvisioningGeneratorMutationExtension` | GraphQL mutations |

Generated archive JCR path: `/sites/systemsite/files/provisioning-generator/provisioning-export.zip`  
Temp ZIP is written to `jahiaVarDiskPath/tmpContent/` then copied to JCR, then deleted.

`generate()` queries `module-management` JCR workspace for active bundles, writes each JAR + a `provisioning.yml` manifest into a ZIP using `ZipOutputStream`.

## GraphQL API

| Operation | Name | Notes |
|-----------|------|-------|
| Query | `provisioningGeneratorIsGenerating` → Boolean | Reads `volatile boolean` from service |
| Query | `provisioningGeneratorArchiveInfo` → `{createdAt}` | Returns `null` if archive doesn't exist in JCR |
| Mutation | `provisioningGeneratorGenerate` → Boolean | Async-safe via `generating` flag; stores result in JCR |
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

- Tests: `tests/cypress/e2e/01-provisioningGenerator.cy.ts`
- Admin path: `/jahia/administration/provisioningGenerator`
- Tests cover: generate archive (polls `isGenerating` until false), download link appears, delete archive, admin UI buttons

## Gotchas

- `volatile boolean generating` is set to `true` at the start of `generate()` and reset to `false` in `finally` — callers should poll `isGenerating` to know when the generation completes, since `generate` mutation returns `true` only after it finishes (it is **synchronous**)
- The mutation returns `true` only after the ZIP is fully written to JCR — it is not async; long generation times will block the GraphQL thread
- If the archive JCR node doesn't exist at `archiveInfo` query time, `null` is returned (not an error) — the UI uses this to show/hide the download button
- CSS Modules: match in Cypress with `[class*="pg_..."]`

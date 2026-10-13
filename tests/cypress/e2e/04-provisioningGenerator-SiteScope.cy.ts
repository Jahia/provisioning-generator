import {createSite, deleteSite, enableModule} from '@jahia/cypress';

/**
 * Site-scoped export (#39): only the modules used by the selected sites, plus their dependencies,
 * end up in the archive, and the archive records which sites it was generated for.
 *
 * The archive is read by the `zipEntryNames` Node task (cypress/plugins/index.js): loading a binary
 * ZIP into the browser through cy.request crashes the Cypress renderer.
 */
describe('Provisioning Generator — site-scoped export', () => {
    const SITE_KEY = 'pgsitescope';
    const ADMIN_PATH = '/jahia/administration/provisioningGenerator';
    const DOWNLOAD_URL = '/files/default/sites/systemsite/files/provisioning-generator/provisioning-export.zip';

    const auth = {
        username: Cypress.env('SUPER_USER_LOGIN') || 'root',
        password: Cypress.env('SUPER_USER_PASSWORD')
    };

    const graphql = (query: string, timeout = 120000) => cy.request({
        method: 'POST',
        url: '/modules/graphql',
        headers: {'Content-Type': 'application/json', Origin: Cypress.config('baseUrl')},
        auth,
        body: {query},
        failOnStatusCode: false,
        timeout
    });

    const archiveEntries = () => cy.task<string[]>('zipEntryNames', {
        url: `${Cypress.config('baseUrl')}${DOWNLOAD_URL}`,
        username: auth.username,
        password: auth.password
    }, {timeout: 60000});

    const hasEntry = (entries: string[], prefix: string) => entries.some(name => name.startsWith(prefix));

    before(() => {
        cy.login();
        createSite(SITE_KEY, {templateSet: 'templates-system', serverName: 'localhost', locale: 'en'});
        enableModule('tags', SITE_KEY);
        graphql('mutation { provisioningGeneratorDelete }');
    });

    after(() => {
        graphql('mutation { provisioningGeneratorDelete }');
        deleteSite(SITE_KEY);
    });

    it('lists the sites available for scoping, without systemsite', () => {
        graphql('query { provisioningGeneratorSites { siteKey title } }').then(res => {
            const siteKeys = res.body.data.provisioningGeneratorSites.map((site: {siteKey: string}) => site.siteKey);
            expect(siteKeys).to.include(SITE_KEY);
            expect(siteKeys).not.to.include('systemsite');
        });
    });

    it('exports only the modules used by the site and records the scope', () => {
        graphql(`mutation { provisioningGeneratorGenerate(siteKeys: ["${SITE_KEY}"]) }`)
            .its('body.data.provisioningGeneratorGenerate')
            .should('eq', true);

        graphql('query { provisioningGeneratorArchiveInfo { createdAt siteKeys } }')
            .its('body.data.provisioningGeneratorArchiveInfo.siteKeys')
            .should('deep.eq', [SITE_KEY]);

        archiveEntries().then(entries => {
            // Template set and module deployed on the site
            expect(hasEntry(entries, 'templates-system-'), 'templates-system').to.eq(true);
            expect(hasEntry(entries, 'tags-'), 'tags').to.eq(true);
            expect(entries).to.include('provisioning.yaml');
            // Platform module used by the site: resolved, but not exported by default
            expect(hasEntry(entries, 'default-'), 'default (system)').to.eq(false);
            // Active module the site does not use
            expect(hasEntry(entries, 'jahia-dashboard-docs-'), 'jahia-dashboard-docs').to.eq(false);
        });
    });

    it('exports the platform modules used by the site when includeSystemModules is true', () => {
        graphql(`mutation { provisioningGeneratorGenerate(siteKeys: ["${SITE_KEY}"], includeSystemModules: true) }`)
            .its('body.data.provisioningGeneratorGenerate')
            .should('eq', true);

        graphql('query { provisioningGeneratorArchiveInfo { siteKeys includesSystemModules } }')
            .its('body.data.provisioningGeneratorArchiveInfo')
            .should('deep.eq', {siteKeys: [SITE_KEY], includesSystemModules: true});

        archiveEntries().then(entries => {
            expect(hasEntry(entries, 'tags-'), 'tags').to.eq(true);
            // Dependencies of the site's modules, including platform ones
            expect(hasEntry(entries, 'default-'), 'default (system)').to.eq(true);
            expect(hasEntry(entries, 'jahia-dashboard-docs-'), 'jahia-dashboard-docs').to.eq(false);
        });
    });

    it('rejects an unknown site with an error and does not start a generation', () => {
        graphql('mutation { provisioningGeneratorGenerate(async: true, siteKeys: ["doesNotExist"]) }').then(res => {
            expect(res.body.errors, 'GraphQL errors').to.have.length.greaterThan(0);
            expect(res.body.errors[0].message).to.include('Unknown site');
        });
        graphql('query { provisioningGeneratorIsGenerating }')
            .its('body.data.provisioningGeneratorIsGenerating')
            .should('eq', false);
    });

    it('exports all active non-platform modules when no site is given', () => {
        graphql('mutation { provisioningGeneratorGenerate }')
            .its('body.data.provisioningGeneratorGenerate')
            .should('eq', true);

        graphql('query { provisioningGeneratorArchiveInfo { siteKeys includesSystemModules } }')
            .its('body.data.provisioningGeneratorArchiveInfo')
            .should('deep.eq', {siteKeys: [], includesSystemModules: false});

        archiveEntries().then(entries => {
            expect(hasEntry(entries, 'tags-'), 'tags').to.eq(true);
            expect(hasEntry(entries, 'default-'), 'default (system)').to.eq(false);
        });
    });

    it('generates a site-scoped archive from the admin UI', () => {
        cy.login();
        cy.visit(ADMIN_PATH);
        cy.contains('Modules to export', {timeout: 30000}).should('be.visible');
        cy.get('#pg-scope-sites').check();

        // No site selected yet: generation is blocked and the reason is exposed to AT
        cy.contains('Select at least one site to generate the archive.').should('be.visible');
        cy.contains('button', 'Generate archive')
            .should('be.disabled')
            .and('have.attr', 'aria-describedby', 'pg-select-site');

        cy.get(`input[type="checkbox"][value="${SITE_KEY}"]`).check();
        cy.contains('Select at least one site to generate the archive.').should('not.exist');
        cy.contains('button', 'Generate archive').should('not.be.disabled').click();

        cy.contains('Archive generated successfully.', {timeout: 120000}).should('be.visible');
        cy.contains(`Contains the modules used by: ${SITE_KEY} · platform modules excluded`).should('be.visible');
    });
});

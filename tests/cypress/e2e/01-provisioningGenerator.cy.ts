import {DocumentNode} from 'graphql';

describe('Provisioning Generator', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const generateArchive: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/generateArchive.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const deleteArchive: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/deleteArchive.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getArchiveInfo: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getArchiveInfo.graphql');

    const graphqlRequestOptions = {
        method: 'POST' as const,
        url: '/modules/graphql',
        headers: {'Content-Type': 'application/json', Origin: Cypress.config('baseUrl')},
        auth: {
            username: Cypress.env('SUPER_USER_LOGIN') || 'root',
            password: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'
        },
        failOnStatusCode: false
    };

    before(() => {
        cy.login();
        // Best-effort cleanup of any archive left over from a previous run
        cy.request({
            ...graphqlRequestOptions,
            body: {query: 'mutation { provisioningGeneratorDelete }'}
        });
    });

    after(() => {
        // Clean up the archive created during the test run
        cy.request({
            ...graphqlRequestOptions,
            body: {query: 'mutation { provisioningGeneratorDelete }'}
        });
    });

    it('provisioning API is available and accepts karaf commands', () => {
        cy.request({
            method: 'POST',
            url: '/modules/api/provisioning',
            headers: {'Content-Type': 'application/yaml'},
            auth: {
                username: Cypress.env('SUPER_USER_LOGIN') || 'root',
                password: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'
            },
            body: '- karafCommand: "log:log \'provisioning-generator cypress test\'"'
        }).its('status').should('eq', 200);
    });

    it('archive info returns null when no archive exists', () => {
        cy.apollo({query: getArchiveInfo})
            .its('data.provisioningGeneratorArchiveInfo')
            .should('be.null');
    });

    it('isGenerating returns false when idle', () => {
        cy.request({
            ...graphqlRequestOptions,
            body: {query: 'query { provisioningGeneratorIsGenerating }'}
        }).its('body.data.provisioningGeneratorIsGenerating').should('eq', false);
    });

    it('generates a provisioning archive and exposes a creation date', () => {
        cy.apollo({mutation: generateArchive})
            .its('data.provisioningGeneratorGenerate')
            .should('eq', true);

        cy.apollo({query: getArchiveInfo})
            .its('data.provisioningGeneratorArchiveInfo.createdAt')
            .should('be.a', 'string')
            .and('match', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('generate command can be run multiple times without errors', () => {
        cy.apollo({mutation: generateArchive})
            .its('data.provisioningGeneratorGenerate')
            .should('eq', true);

        cy.apollo({mutation: generateArchive})
            .its('data.provisioningGeneratorGenerate')
            .should('eq', true);
    });

    it('deletes the provisioning archive', () => {
        cy.apollo({mutation: deleteArchive})
            .its('data.provisioningGeneratorDelete')
            .should('eq', true);

        cy.apollo({query: getArchiveInfo})
            .its('data.provisioningGeneratorArchiveInfo')
            .should('be.null');
    });
});

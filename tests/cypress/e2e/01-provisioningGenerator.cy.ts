import {DocumentNode} from 'graphql';

describe('Provisioning Generator', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mountVfs: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/mountVfs.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getChildrenByPath: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getChildrenByPath.graphql');

    const hasZipFile = (nodes: Array<{name: string}>) => nodes.some(n => n.name.endsWith('.zip'));

    const MOUNT_NAME = 'provisioningGeneratorTest';
    const MOUNT_JCR_PATH = `/mounts/${MOUNT_NAME}-mount`;
    const MOUNT_CONTENT_PATH = `/sites/systemsite/files/${MOUNT_NAME}`;

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
        // Best-effort cleanup of any leftover VFS mount from a previous run
        cy.request({
            ...graphqlRequestOptions,
            body: {query: `mutation { jcr(workspace: EDIT) { deleteNode(pathOrId: "${MOUNT_JCR_PATH}") } }`}
        });
    });

    after(() => {
        // Unmount and remove the VFS mount point configuration node
        cy.request({
            ...graphqlRequestOptions,
            body: {query: `mutation { admin { mountPoint { unmount(pathOrId: "${MOUNT_JCR_PATH}") } } }`}
        });
        cy.request({
            ...graphqlRequestOptions,
            body: {query: `mutation { jcr(workspace: EDIT) { deleteNode(pathOrId: "${MOUNT_JCR_PATH}") } }`}
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

    it('generates a provisioning archive for active modules', () => {
        cy.request({
            method: 'POST',
            url: '/modules/api/provisioning',
            headers: {'Content-Type': 'application/yaml'},
            auth: {
                username: Cypress.env('SUPER_USER_LOGIN') || 'root',
                password: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'
            },
            body: '- karafCommand: "provisioning-generator:generate"'
        }).its('status').should('eq', 200);

        // Mount /var/jahia/content/tmp as a VFS to browse the generated archive
        cy.apollo({mutation: mountVfs});

        // The VFS provider activates asynchronously — retry until ZIP files appear
        cy.waitUntil(
            () => cy.apollo({query: getChildrenByPath, variables: {path: MOUNT_CONTENT_PATH, childrenTypes: ['jnt:file']}})
                .its('data.jcr.nodeByPath.children.nodes')
                .then(hasZipFile),
            {timeout: 15000, interval: 1000, errorMsg: 'No ZIP files found in VFS mount after timeout'}
        );
    });

    it('generate command can be run multiple times without errors', () => {
        const script = '- karafCommand: "provisioning-generator:generate"';
        cy.request({
            method: 'POST',
            url: '/modules/api/provisioning',
            headers: {'Content-Type': 'application/yaml'},
            auth: {
                username: Cypress.env('SUPER_USER_LOGIN') || 'root',
                password: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'
            },
            body: script
        }).its('status').should('eq', 200);

        cy.request({
            method: 'POST',
            url: '/modules/api/provisioning',
            headers: {'Content-Type': 'application/yaml'},
            auth: {
                username: Cypress.env('SUPER_USER_LOGIN') || 'root',
                password: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'
            },
            body: script
        }).its('status').should('eq', 200);
    });
});

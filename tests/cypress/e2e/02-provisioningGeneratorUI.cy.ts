import {DocumentNode} from "graphql";

describe('Provisioning Generator – UI', () => {
    const adminPath = '/jahia/administration/provisioningGenerator';

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
        // Ensure no archive is present before the suite starts
        cy.request({
            ...graphqlRequestOptions,
            body: {query: 'mutation { provisioningGeneratorDelete }'}
        });
    });

    after(() => {
        // Clean up any archive left by the suite
        cy.request({
            ...graphqlRequestOptions,
            body: {query: 'mutation { provisioningGeneratorDelete }'}
        });
    });

    it('renders the page with title, description and generate button when no archive exists', () => {
        cy.login();
        cy.visit(adminPath);
        cy.contains('h2', 'Provisioning Generator').should('be.visible');
        cy.contains('Generate a ZIP archive of all active Jahia modules').should('be.visible');
        cy.contains('button', 'Generate archive').should('be.visible');
        cy.contains('Generated on').should('not.exist');
        cy.contains('a', 'Download provisioning-export.zip').should('not.exist');
    });

    it('shows loading indicator and hides generate button while generating', () => {
        cy.login();
        cy.visit(adminPath);
        cy.contains('button', 'Generate archive').click();
        cy.contains('Generating archive, please wait…').should('be.visible');
        cy.contains('button', 'Generate archive').should('not.exist');
        cy.contains('Archive generated successfully.', {timeout: 120000}).should('be.visible');
        cy.contains('button', 'Generate archive').should('be.visible');
    });

    it('displays the archive section with creation date and download link after generating', () => {
        cy.login();
        cy.visit(adminPath);
        cy.contains('Generated on').should('be.visible');
        cy.contains('a', 'Download provisioning-export.zip')
            .should('be.visible')
            .and('have.attr', 'href', '/files/default/sites/systemsite/files/provisioning-generator/provisioning-export.zip')
            .and('have.attr', 'download', 'provisioning-export.zip');
        cy.contains('button', 'Delete archive').should('be.visible');
    });

    it('shows loading indicator and removes archive section when delete button is clicked', () => {
        cy.login();
        // Ensure archive exists before testing the delete flow
        cy.request({
            ...graphqlRequestOptions,
            body: {query: 'mutation { provisioningGeneratorGenerate }'},
            timeout: 120000
        });
        // Delay the delete mutation response so the loading state is reliably assertable
        cy.intercept('POST', '/modules/graphql', req => {
            const body = req.body as {query?: string};
            if (body?.query?.includes('provisioningGeneratorDelete')) {
                req.on('response', res => {
                    res.setDelay(1000);
                });
            }
        }).as('deleteMutation');
        cy.visit(adminPath);
        // Wait for the archive section to be fully rendered before clicking delete
        cy.contains('Generated on').should('be.visible');
        cy.contains('button', 'Delete archive').click();
        // Loading indicator must be visible while the mutation is in flight
        cy.contains('Deleting archive…').should('be.visible');
        cy.contains('button', 'Delete archive').should('not.exist');
        cy.wait('@deleteMutation');
        // Archive section must be gone after deletion
        cy.contains('a', 'Download provisioning-export.zip', {timeout: 30000}).should('not.exist');
        cy.contains('Generated on').should('not.exist');
        cy.contains('button', 'Generate archive').should('be.visible');
    });
});

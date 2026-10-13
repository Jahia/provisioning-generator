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
        // First admin UI load of the suite: allow extra time for the Jahia admin shell to mount
        // the federated provisioning-generator remote module and activate the SPA route.
        cy.contains('h2', 'Provisioning Generator', {timeout: 30000}).should('be.visible');
        cy.contains('Package this server\'s modules into a ZIP archive').should('be.visible');
        cy.contains('No archive yet.').should('be.visible');
        cy.contains('button', 'Generate archive').should('be.visible');
        cy.contains('Generated on').should('not.exist');
        cy.contains('a', 'Download provisioning-export.zip').should('not.exist');
    });

    it('shows loading indicator and hides generate button while generating', () => {
        cy.login();
        // The UI must request a background generation so the HTTP call cannot hit a reverse-proxy timeout
        cy.intercept('POST', '/modules/graphql', req => {
            const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            if (raw && raw.includes('provisioningGeneratorGenerate')) {
                req.alias = 'generateMutation';
            }
        });
        cy.visit(adminPath);
        cy.contains('button', 'Generate archive').click();
        cy.wait('@generateMutation').then(({request}) => {
            const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
            expect(raw).to.include('"async":true');
        });
        cy.contains('Generating archive, please wait…').should('be.visible');
        cy.contains('button', 'Generate archive').should('not.exist');
        cy.contains('Archive generated successfully.', {timeout: 120000}).should('be.visible');
        cy.contains('button', 'Generate archive').should('be.visible');
    });

    it('shows a proxy-timeout warning and still picks up the archive when the generate request gets a 504', () => {
        cy.login();
        let mutationAnswered = false;
        cy.intercept('POST', '/modules/graphql', req => {
            const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            if (raw && raw.includes('provisioningGeneratorGenerate')) {
                // Let Jahia start the generation, but answer like a reverse proxy that gave up waiting
                req.alias = 'generateMutation';
                req.continue(res => {
                    mutationAnswered = true;
                    res.send({
                        statusCode: 504,
                        headers: {'content-type': 'text/html'},
                        body: '<!DOCTYPE html><html><body><h1>504 Gateway Time-out</h1></body></html>'
                    });
                });
            } else if (raw && raw.includes('provisioningGeneratorIsGenerating') && mutationAnswered) {
                // Slow down the first status poll so the warning is reliably visible before completion
                mutationAnswered = false;
                req.on('response', res => {
                    res.setDelay(3000);
                });
            }
        });
        cy.visit(adminPath);
        cy.contains('button', 'Generate archive').click();
        cy.wait('@generateMutation');
        cy.contains('The request timed out at the proxy level').should('be.visible');
        cy.contains('An error occurred while generating the archive.').should('not.exist');
        cy.contains('Archive generated successfully.', {timeout: 120000}).should('be.visible');
        cy.contains('The request timed out at the proxy level').should('not.exist');
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
        // Delay the delete mutation response so the loading state is reliably assertable.
        // Apollo may send single or batched bodies, and req.body can be a parsed object,
        // an array (batched HTTP link), or a raw string — check all shapes.
        cy.intercept('POST', '/modules/graphql', req => {
            const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            if (raw && raw.includes('provisioningGeneratorDelete')) {
                req.alias = 'deleteMutation';
                req.on('response', res => {
                    res.setDelay(5000);
                });
            }
        });
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

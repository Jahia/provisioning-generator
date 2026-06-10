import {DocumentNode} from 'graphql';
import {createUser, deleteUser, grantRoles} from '@jahia/cypress';

/**
 * Regression tests for the fine-grained `provisioningGeneratorAdmin` permission.
 *
 * These guard against the gate being silently removed or mismatched across the stack:
 *  - Backend: `@GraphQLRequiresPermission("provisioningGeneratorAdmin")` is enforced as
 *    `session.getNode("/").hasPermission("provisioningGeneratorAdmin")` (root-node ACL check).
 *  - Frontend: `requiredPermission: 'provisioningGeneratorAdmin'` in register.jsx gates the admin route.
 *  - RBAC content: the module ships the assignable `provisioning-generator-administrator` role
 *    (src/main/import/roles.xml) granting ONLY that permission (+ `administrationAccess` for the UI entry).
 *
 * The "allowed" user is granted that role and nothing else — never `admin` — so the tests prove
 * fine-grained granularity, not merely that a full administrator can pass.
 */
describe('Provisioning Generator — permission enforcement', () => {
    const ROLE_NAME = 'provisioning-generator-administrator';
    const DENIED_USER = 'pgDeniedUser';
    const ALLOWED_USER = 'pgAllowedUser';
    const PASSWORD = 'PgPerm9PwdTest';
    const ADMIN_PATH = '/jahia/administration/provisioningGenerator';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getArchiveInfo: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getArchiveInfo.graphql');

    const errorsOf = (result: {graphQLErrors?: Array<{message: string}>; errors?: Array<{message: string}>}) =>
        result.graphQLErrors ?? result.errors ?? [];

    const queryArchiveInfoAs = (username: string) => {
        cy.apolloClient({username, password: PASSWORD});
        return cy.apollo({query: getArchiveInfo});
    };

    before(() => {
        cy.login();
        createUser(DENIED_USER, PASSWORD);
        createUser(ALLOWED_USER, PASSWORD);
        // The annotation resolves the permission on the JCR root node, so grant the
        // module-shipped single-permission role on `/`.
        grantRoles('/', [ROLE_NAME], ALLOWED_USER, 'USER');
    });

    after(() => {
        cy.apolloClient(); // reset the current Apollo client back to root
        cy.login();
        deleteUser(DENIED_USER);
        deleteUser(ALLOWED_USER);
    });

    describe('GraphQL API authorization', () => {
        it('denies the gated query for a user without the permission', () => {
            queryArchiveInfoAs(DENIED_USER).then((result: never) => {
                const errs = errorsOf(result);
                expect(errs, 'denial errors').to.have.length.greaterThan(0);
                expect(errs.map((e: {message: string}) => e.message).join(' ')).to.contain('Permission denied');
            });
        });

        it('allows the gated query for a user granted only the module permission', () => {
            queryArchiveInfoAs(ALLOWED_USER).then((result: never) => {
                expect(errorsOf(result), 'should have no errors').to.have.length(0);
                // Read-only query succeeds end-to-end; no archive present → null payload.
                expect((result as {data: {provisioningGeneratorArchiveInfo: unknown}}).data)
                    .to.have.property('provisioningGeneratorArchiveInfo');
            });
        });
    });

    describe('Admin UI authorization', () => {
        it('hides the admin panel from a user without the permission', () => {
            cy.login(DENIED_USER, PASSWORD);
            cy.visit(ADMIN_PATH, {failOnStatusCode: false});
            cy.contains('h2', 'Provisioning Generator').should('not.exist');
        });

        it('shows the admin panel to a user granted only the module permission', () => {
            cy.login(ALLOWED_USER, PASSWORD);
            cy.visit(ADMIN_PATH);
            cy.contains('h2', 'Provisioning Generator', {timeout: 30000}).should('be.visible');
        });
    });
});

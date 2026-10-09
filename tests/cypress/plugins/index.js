/// <reference types="cypress" />
// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

/**
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('cypress-terminal-report/src/installLogsPrinter')(on);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@jahia/cypress/dist/plugins/registerPlugins').registerPlugins(on, config);

    on('task', {
        // Downloads a ZIP on the Node side and returns its entry names (from the central directory),
        // so specs never load binary archives into the browser
        async zipEntryNames({url, username, password}) {
            const authorization = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
            const response = await fetch(url, {headers: {Authorization: authorization}});
            if (!response.ok) {
                throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
            }

            const zip = Buffer.from(await response.arrayBuffer());
            const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
            if (eocd < 0) {
                throw new Error('Not a ZIP archive: end of central directory not found');
            }

            const entries = zip.readUInt16LE(eocd + 10);
            let offset = zip.readUInt32LE(eocd + 16);
            const names = [];
            for (let i = 0; i < entries; i++) {
                const nameLength = zip.readUInt16LE(offset + 28);
                const extraLength = zip.readUInt16LE(offset + 30);
                const commentLength = zip.readUInt16LE(offset + 32);
                names.push(zip.toString('utf8', offset + 46, offset + 46 + nameLength));
                offset += 46 + nameLength + extraLength + commentLength;
            }

            return names;
        }
    });

    return config;
};

import {registry} from '@jahia/ui-extender';
import register from './ProvisioningGenerator/register';
import i18next from 'i18next';

export default function () {
    registry.add('callback', 'provisioning-generator', {
        targets: ['jahiaApp-init:50'],
        callback: async () => {
            await i18next.loadNamespaces('provisioning-generator', () => {
                console.debug('%c provisioning-generator: i18n namespace loaded', 'color: #463CBA');
            });
            register();
            console.debug('%c provisioning-generator: activation completed', 'color: #463CBA');
        }
    });
}

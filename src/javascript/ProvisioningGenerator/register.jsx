import {registry} from '@jahia/ui-extender';
import {ProvisioningGeneratorAdmin} from './ProvisioningGenerator';
import React from 'react';

export default () => {
    console.debug('%c provisioning-generator: activation in progress', 'color: #463CBA');
    registry.add('adminRoute', 'provisioningGenerator', {
        targets: ['administration-server-systemComponents:999'],
        requiredPermission: 'admin',
        label: 'provisioning-generator:label.menu_entry',
        isSelectable: true,
        render: () => React.createElement(ProvisioningGeneratorAdmin)
    });
};

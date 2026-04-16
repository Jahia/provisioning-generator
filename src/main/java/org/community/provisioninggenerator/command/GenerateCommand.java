package org.community.provisioninggenerator.command;

import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.community.provisioninggenerator.services.ProvisioningGeneratorService;
import org.jahia.api.settings.SettingsBean;
import org.jahia.osgi.BundleUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;

@Command(scope = "provisioning-generator", name = "generate", description = "Generate provisioning file of all Jahia modules currently running")
@Service
public class GenerateCommand implements Action {

    private static final Logger logger = LoggerFactory.getLogger(GenerateCommand.class);

    @Override
    public Object execute() throws Exception {
        final SettingsBean settingsBean = BundleUtils.getOsgiService(SettingsBean.class, null);
        final ProvisioningGeneratorService service = BundleUtils.getOsgiService(ProvisioningGeneratorService.class, null);
        final File generatedFile = service.generate(settingsBean.getTmpContentDiskPath());
        logger.info("Provisioning archive generated at: {}", generatedFile.getAbsolutePath());
        return generatedFile.getAbsolutePath();
    }
}

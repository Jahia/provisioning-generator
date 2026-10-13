package org.community.provisioninggenerator.command;

import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.Option;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.community.provisioninggenerator.services.ExportScope;
import org.community.provisioninggenerator.services.ProvisioningGeneratorService;
import org.jahia.api.settings.SettingsBean;
import org.jahia.osgi.BundleUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.List;

@Command(scope = "provisioning-generator", name = "generate", description = "Generate provisioning file of all Jahia modules currently running")
@Service
public class GenerateCommand implements Action {

    private static final Logger logger = LoggerFactory.getLogger(GenerateCommand.class);

    @Option(name = "-s", aliases = "--site", multiValued = true,
            description = "Export only the modules used by this site and their dependencies (repeatable)")
    private List<String> sites;

    @Option(name = "--include-system",
            description = "Also export platform modules (Jahia-Module-Type: system), which ship with Jahia")
    private boolean includeSystem;

    @Override
    public Object execute() throws Exception {
        final SettingsBean settingsBean = BundleUtils.getOsgiService(SettingsBean.class, null);
        final ProvisioningGeneratorService service = BundleUtils.getOsgiService(ProvisioningGeneratorService.class, null);
        if (settingsBean == null || service == null) {
            logger.error("Required OSGi services are not available");
            return null;
        }

        final File generatedFile = service.generate(settingsBean.getTmpContentDiskPath(),
                ExportScope.of(sites, includeSystem));
        logger.info("Provisioning archive generated at: {}", generatedFile.getAbsolutePath());
        return generatedFile.getAbsolutePath();
    }
}

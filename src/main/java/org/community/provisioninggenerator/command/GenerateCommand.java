package org.community.provisioninggenerator.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.jcr.Node;
import javax.jcr.NodeIterator;
import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.community.provisioninggenerator.BundleInstall;
import org.jahia.registries.ServicesRegistry;
import org.jahia.services.content.JCRCallback;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.JCRTemplate;
import org.jahia.settings.SettingsBean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StreamUtils;

@Command(scope = "provisioning-generator", name = "generate", description = "Generate provisioning file of all Jahia modules currently running")
@Service
public class GenerateCommand implements Action {

    private static final Logger LOGGER = LoggerFactory.getLogger(GenerateCommand.class);
    private static final String QUERY = "SELECT * FROM [jnt:moduleManagementBundle] as N WHERE ISDESCENDANTNODE(N, '/module-management/') "
            + "AND N.[j:groupId]='%s' AND N.[j:symbolicName]='%s' AND N.[j:version]='%s'";

    @Override
    public Object execute() throws Exception {
        final String tmpPath = SettingsBean.getInstance().getTmpContentDiskPath();
        final String zipPath = tmpPath + "/modulesExport" + System.currentTimeMillis() + ".zip";

        final JCRCallback callBack = (JCRCallback< Object>) (JCRSessionWrapper session) -> {
            try {
                //Create the file
                final String diskPath = SettingsBean.getInstance().getTmpContentDiskPath();
                final String filename = diskPath + "/modulesExport" + System.currentTimeMillis() + ".zip";
                final File file = new File(filename);
                if (file.createNewFile()) {

                    final FileOutputStream os = new FileOutputStream(file);

                    try ( ZipOutputStream zipOutputStream = new ZipOutputStream(os)) {
                        LOGGER.info("Module Export started, this may take some time");

                        final ObjectMapper objectMapper = new ObjectMapper(new YAMLFactory());
                        final List<BundleInstall> bundleKeys = new ArrayList<>();
                        ServicesRegistry.getInstance().getJahiaTemplateManagerService().getAvailableTemplatePackages().stream()
                                .filter((module) -> (module.isActiveVersion())).forEachOrdered((module) -> {
                            LOGGER.info(module.getBundleKey());
                            final String query = String.format(QUERY, module.getGroupId(), module.getBundle().getSymbolicName(), module.getVersion().toString());
                            try {
                                final NodeIterator nodeIterator = session.getWorkspace().getQueryManager().createQuery(query, Query.JCR_SQL2).execute().getNodes();
                                while (nodeIterator.hasNext()) {
                                    final JCRNodeWrapper node = (JCRNodeWrapper) nodeIterator.nextNode();
                                    final String nodeName = node.getName();
                                    LOGGER.info("Compressing Node: " + nodeName);

                                    final Node fileContent = node.getNode("jcr:content");
                                    // Add zip entry
                                    try ( InputStream content = fileContent.getProperty("jcr:data").getBinary().getStream()) {
                                        // Add zip entry
                                        final byte[] buffer = StreamUtils.copyToByteArray(content);
                                        final ZipEntry zipEntry = new ZipEntry(nodeName);
                                        bundleKeys.add(new BundleInstall(nodeName));

                                        zipOutputStream.putNextEntry(zipEntry);
                                        zipOutputStream.write(buffer);
                                        zipOutputStream.closeEntry();
                                    } catch (IOException ex) {
                                        LOGGER.error("Impossible to retrieve module content", ex);
                                    }
                                }
                            } catch (RepositoryException ex) {
                                LOGGER.error("Impossible to retrieve module", ex);
                            }
                        });
                        final ZipEntry zipEntry = new ZipEntry("provisionning.yaml");
                        zipOutputStream.putNextEntry(zipEntry);
                        zipOutputStream.write(objectMapper.writer().writeValueAsBytes(bundleKeys));
                        zipOutputStream.closeEntry();
                        LOGGER.info("Modules Export has been done, the file can be found at:  " + filename);
                    }
                } else if (LOGGER.isErrorEnabled()) {
                    LOGGER.error(String.format("Impossible to create file %s", filename));
                }
            } catch (IOException ex) {
                LOGGER.error("Error when creating zip", ex);
            }

            return null;
        };

        JCRTemplate.getInstance().doExecuteWithSystemSession(callBack);

        return zipPath;
    }
}

package org.community.provisioninggenerator.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.community.provisioninggenerator.BundleInstall;
import org.jahia.api.Constants;
import org.jahia.api.content.JCRTemplate;
import org.jahia.api.settings.SettingsBean;
import org.jahia.api.templates.JahiaTemplateManagerService;
import org.jahia.data.templates.JahiaTemplatesPackage;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.JCRNodeWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StreamUtils;

import javax.jcr.Node;
import javax.jcr.NodeIterator;
import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Command(scope = "provisioning-generator", name = "generate", description = "Generate provisioning file of all Jahia modules currently running")
@Service
public class GenerateCommand implements Action {
    private static final Logger logger = LoggerFactory.getLogger(GenerateCommand.class);

    private static final String QUERY = "SELECT * FROM [jnt:moduleManagementBundle] WHERE ISDESCENDANTNODE('/module-management/')"
            + " AND [j:groupId]='%s' AND [j:symbolicName]='%s' AND [j:version]='%s'";

    @Override
    public Object execute() throws Exception {
        final SettingsBean settingsBean = BundleUtils.getOsgiService(SettingsBean.class, null);
        final String zipPath = settingsBean.getTmpContentDiskPath() + "/modulesExport" + System.currentTimeMillis() + ".zip";

        BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(null, Constants.EDIT_WORKSPACE, null, session -> {
            try {
                //Create the file
                final String diskPath = settingsBean.getTmpContentDiskPath();
                final String filename = diskPath + "/modulesExport" + System.currentTimeMillis() + ".zip";
                final File file = new File(filename);
                if (file.createNewFile()) {

                    final FileOutputStream os = new FileOutputStream(file);

                    try (ZipOutputStream zipOutputStream = new ZipOutputStream(os)) {
                        logger.info("Module Export started, this may take some time");

                        final ObjectMapper objectMapper = new ObjectMapper(new YAMLFactory());
                        final List<BundleInstall> bundleKeys = new ArrayList<>();
                        BundleUtils.getOsgiService(JahiaTemplateManagerService.class, null).getAvailableTemplatePackages().stream()
                                .filter(JahiaTemplatesPackage::isActiveVersion).forEachOrdered(module -> {
                                    logger.info(module.getBundleKey());
                                    final String query = String.format(QUERY, module.getGroupId(), module.getBundle().getSymbolicName(), module.getBundle().getVersion().toString());
                                    try {
                                        final NodeIterator nodeIterator = session.getWorkspace().getQueryManager().createQuery(query, Query.JCR_SQL2).execute().getNodes();
                                        while (nodeIterator.hasNext()) {
                                            final JCRNodeWrapper node = (JCRNodeWrapper) nodeIterator.nextNode();
                                            final String nodeName = node.getName();
                                            logger.info("Compressing Node: " + nodeName);

                                            final Node fileContent = node.getNode("jcr:content");
                                            // Add zip entry
                                            try (InputStream content = fileContent.getProperty("jcr:data").getBinary().getStream()) {
                                                // Add zip entry
                                                final byte[] buffer = StreamUtils.copyToByteArray(content);
                                                final ZipEntry zipEntry = new ZipEntry(nodeName);
                                                bundleKeys.add(new BundleInstall(nodeName));

                                                zipOutputStream.putNextEntry(zipEntry);
                                                zipOutputStream.write(buffer);
                                                zipOutputStream.closeEntry();
                                            } catch (IOException e) {
                                                logger.error("Impossible to retrieve module content", e);
                                            }
                                        }
                                    } catch (RepositoryException e) {
                                        logger.error("Impossible to retrieve module", e);
                                    }
                                });
                        final ZipEntry zipEntry = new ZipEntry("provisionning.yaml");
                        zipOutputStream.putNextEntry(zipEntry);
                        zipOutputStream.write(objectMapper.writer().writeValueAsBytes(bundleKeys));
                        zipOutputStream.closeEntry();
                        logger.info("Modules Export has been done, the file can be found at:  " + filename);
                    }
                } else if (logger.isErrorEnabled()) {
                    logger.error("Impossible to create file {}", filename);
                }
            } catch (IOException e) {
                logger.error("Error when creating zip", e);
            }
            return null;
        });
        return zipPath;
    }
}

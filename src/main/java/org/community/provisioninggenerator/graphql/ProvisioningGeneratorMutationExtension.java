package org.community.provisioninggenerator.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.community.provisioninggenerator.services.ProvisioningGeneratorService;
import org.jahia.api.Constants;
import org.jahia.api.content.JCRTemplate;
import org.jahia.api.settings.SettingsBean;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.JCRNodeWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.RepositoryException;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;

@GraphQLTypeExtension(DXGraphQLProvider.Mutation.class)
@GraphQLName("ProvisioningGeneratorMutations")
@GraphQLDescription("Provisioning Generator mutations")
public class ProvisioningGeneratorMutationExtension {

    private static final Logger LOGGER = LoggerFactory.getLogger(ProvisioningGeneratorMutationExtension.class);
    static final String JCR_FOLDER = "provisioning-generator";
    static final String JCR_FILENAME = "provisioning-export.zip";
    static final String ARCHIVE_JCR_PATH = String.join("/", "", "sites", "systemsite", "files", JCR_FOLDER, JCR_FILENAME);

    private ProvisioningGeneratorMutationExtension() {
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorGenerate")
    @GraphQLDescription("Generates a provisioning ZIP archive of all active Jahia modules and stores it in JCR."
            + " With async=true, starts the generation in the background and returns immediately"
            + " (poll provisioningGeneratorIsGenerating); returns false if a generation is already in progress.")
    @GraphQLRequiresPermission("provisioningGeneratorAdmin")
    public static Boolean generate(@GraphQLName("async")
                                   @GraphQLDescription("Run the generation in the background (default: false)")
                                   Boolean async) {
        final SettingsBean settingsBean = BundleUtils.getOsgiService(SettingsBean.class, null);
        final ProvisioningGeneratorService service = BundleUtils.getOsgiService(ProvisioningGeneratorService.class, null);

        if (settingsBean == null || service == null) {
            LOGGER.error("Required OSGi services are not available");
            return Boolean.FALSE;
        }

        try {
            if (Boolean.TRUE.equals(async)) {
                final boolean started = service.generateAsync(settingsBean.getTmpContentDiskPath(),
                        ProvisioningGeneratorMutationExtension::storeArchive);
                if (!started) {
                    LOGGER.warn("A provisioning archive is already being generated");
                }
                return started;
            }
            service.generate(settingsBean.getTmpContentDiskPath(), ProvisioningGeneratorMutationExtension::storeArchive);
            return Boolean.TRUE;
        } catch (IllegalStateException e) {
            LOGGER.warn(e.getMessage());
            return Boolean.FALSE;
        } catch (RepositoryException e) {
            LOGGER.error("Error generating provisioning archive", e);
            return Boolean.FALSE;
        }
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorDelete")
    @GraphQLDescription("Deletes the provisioning archive from JCR")
    @GraphQLRequiresPermission("provisioningGeneratorAdmin")
    public static Boolean delete() {
        try {
            BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                    null, Constants.EDIT_WORKSPACE, null, session -> {
                        final String nodePath = ARCHIVE_JCR_PATH;
                        try {
                            if (session.nodeExists(nodePath)) {
                                session.getNode(nodePath).remove();
                                session.save();
                            }
                        } catch (RepositoryException e) {
                            LOGGER.error("Error deleting provisioning archive from JCR", e);
                        }
                        return null;
                    });
            return Boolean.TRUE;
        } catch (RepositoryException e) {
            LOGGER.error("Error deleting provisioning archive", e);
            return Boolean.FALSE;
        }
    }

    private static void storeArchive(File zipFile) throws RepositoryException {
        try {
            writeToJcr(zipFile);
        } finally {
            if (zipFile.exists()) {
                try {
                    Files.delete(zipFile.toPath());
                } catch (IOException e) {
                    LOGGER.warn("Could not delete temporary zip file: {}", zipFile.getAbsolutePath(), e);
                }
            }
        }
    }

    private static void writeToJcr(File zipFile) throws RepositoryException {
        BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                null, Constants.EDIT_WORKSPACE, null, session -> {
                    try {
                        final JCRNodeWrapper filesNode = session.getNode("/sites/systemsite/files");
                        final JCRNodeWrapper folder;
                        if (filesNode.hasNode(JCR_FOLDER)) {
                            folder = filesNode.getNode(JCR_FOLDER);
                        } else {
                            folder = filesNode.addNode(JCR_FOLDER, "jnt:folder");
                        }
                        try (FileInputStream fis = new FileInputStream(zipFile)) {
                            folder.uploadFile(JCR_FILENAME, fis, "application/zip");
                        }
                        session.save();
                    } catch (RepositoryException | IOException e) {
                        LOGGER.error("Error writing provisioning archive to JCR", e);
                    }
                    return null;
                });
    }
}

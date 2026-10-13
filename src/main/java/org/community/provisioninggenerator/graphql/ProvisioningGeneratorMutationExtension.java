package org.community.provisioninggenerator.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.community.provisioninggenerator.services.ExportScope;
import org.community.provisioninggenerator.services.ProvisioningGeneratorService;
import org.jahia.api.Constants;
import org.jahia.api.content.JCRTemplate;
import org.jahia.api.settings.SettingsBean;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
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
import java.util.List;

@GraphQLTypeExtension(DXGraphQLProvider.Mutation.class)
@GraphQLName("ProvisioningGeneratorMutations")
@GraphQLDescription("Provisioning Generator mutations")
public class ProvisioningGeneratorMutationExtension {

    private static final Logger LOGGER = LoggerFactory.getLogger(ProvisioningGeneratorMutationExtension.class);
    static final String JCR_FOLDER = "provisioning-generator";
    static final String JCR_FILENAME = "provisioning-export.zip";
    static final String ARCHIVE_MIXIN = "pgmix:provisioningArchive";
    static final String SITE_KEYS_PROPERTY = "pgmix:siteKeys";
    static final String INCLUDES_SYSTEM_MODULES_PROPERTY = "pgmix:includesSystemModules";
    static final String ARCHIVE_JCR_PATH = String.join("/", "", "sites", "systemsite", "files", JCR_FOLDER, JCR_FILENAME);

    private ProvisioningGeneratorMutationExtension() {
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorGenerate")
    @GraphQLDescription("Generates a provisioning ZIP archive of all active Jahia modules and stores it in JCR."
            + " With async=true, starts the generation in the background and returns immediately"
            + " (poll provisioningGeneratorIsGenerating); returns false if a generation is already in progress."
            + " With siteKeys, only the modules used by these sites and their dependencies are exported."
            + " Platform modules (Jahia-Module-Type: system) are exported only with includeSystemModules=true.")
    @GraphQLRequiresPermission("provisioningGeneratorAdmin")
    public static Boolean generate(@GraphQLName("async")
                                   @GraphQLDescription("Run the generation in the background (default: false)")
                                   Boolean async,
                                   @GraphQLName("siteKeys")
                                   @GraphQLDescription("Export only the modules used by these sites, with their"
                                           + " dependencies (default: all active modules)")
                                   List<String> siteKeys,
                                   @GraphQLName("includeSystemModules")
                                   @GraphQLDescription("Also export platform modules (Jahia-Module-Type: system),"
                                           + " which ship with Jahia (default: false)")
                                   Boolean includeSystemModules) {
        final SettingsBean settingsBean = BundleUtils.getOsgiService(SettingsBean.class, null);
        final ProvisioningGeneratorService service = BundleUtils.getOsgiService(ProvisioningGeneratorService.class, null);

        if (settingsBean == null || service == null) {
            LOGGER.error("Required OSGi services are not available");
            return Boolean.FALSE;
        }

        try {
            final ExportScope scope = ExportScope.of(siteKeys, Boolean.TRUE.equals(includeSystemModules));
            final ProvisioningGeneratorService.ArchiveHandler handler = zipFile -> storeArchive(zipFile, scope);
            if (Boolean.TRUE.equals(async)) {
                final boolean started = service.generateAsync(settingsBean.getTmpContentDiskPath(), scope, handler);
                if (!started) {
                    LOGGER.warn("A provisioning archive is already being generated");
                }
                return started;
            }
            service.generate(settingsBean.getTmpContentDiskPath(), scope, handler);
            return Boolean.TRUE;
        } catch (IllegalArgumentException e) {
            throw new DataFetchingException(e.getMessage());
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

    private static void storeArchive(File zipFile, ExportScope scope) throws RepositoryException {
        try {
            writeToJcr(zipFile, scope);
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

    private static void recordScope(JCRNodeWrapper archive, ExportScope scope) throws RepositoryException {
        final List<String> sites = scope.getSiteKeys();
        if (!archive.isNodeType(ARCHIVE_MIXIN)) {
            archive.addMixin(ARCHIVE_MIXIN);
        }
        if (sites.isEmpty()) {
            if (archive.hasProperty(SITE_KEYS_PROPERTY)) {
                archive.getProperty(SITE_KEYS_PROPERTY).remove();
            }
        } else {
            archive.setProperty(SITE_KEYS_PROPERTY, sites.toArray(new String[0]));
        }
        archive.setProperty(INCLUDES_SYSTEM_MODULES_PROPERTY, scope.isIncludeSystemModules());
    }

    private static void writeToJcr(File zipFile, ExportScope scope) throws RepositoryException {
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
                        recordScope(folder.getNode(JCR_FILENAME), scope);
                        session.save();
                    } catch (RepositoryException | IOException e) {
                        LOGGER.error("Error writing provisioning archive to JCR", e);
                    }
                    return null;
                });
    }
}

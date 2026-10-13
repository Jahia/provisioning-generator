package org.community.provisioninggenerator.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.community.provisioninggenerator.services.ProvisioningGeneratorService;
import org.jahia.api.Constants;
import org.jahia.api.content.JCRTemplate;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;
import org.jahia.osgi.BundleUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.Node;
import javax.jcr.NodeIterator;
import javax.jcr.Value;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@GraphQLTypeExtension(DXGraphQLProvider.Query.class)
@GraphQLName("ProvisioningGeneratorQueries")
@GraphQLDescription("Provisioning Generator queries")
public class ProvisioningGeneratorQueryExtension {

    private static final Logger LOGGER = LoggerFactory.getLogger(ProvisioningGeneratorQueryExtension.class);

    private ProvisioningGeneratorQueryExtension() {
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorIsGenerating")
    @GraphQLDescription("Returns true if a provisioning archive is currently being generated")
    @GraphQLRequiresPermission("provisioningGeneratorAdmin")
    public static Boolean isGenerating() {
        final ProvisioningGeneratorService service = BundleUtils.getOsgiService(ProvisioningGeneratorService.class, null);
        return service != null && service.isGenerating();
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorArchiveInfo")
    @GraphQLDescription("Returns archive metadata if the provisioning archive exists in JCR, null otherwise")
    @GraphQLRequiresPermission("provisioningGeneratorAdmin")
    public static GqlArchiveInfo archiveInfo() {
        try {
            return BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                    null, Constants.EDIT_WORKSPACE, null, session -> {
                        final String nodePath = ProvisioningGeneratorMutationExtension.ARCHIVE_JCR_PATH;
                        try {
                            if (!session.nodeExists(nodePath)) {
                                return null;
                            }
                            final Node archive = session.getNode(nodePath);
                            final Node contentNode = archive.getNode("jcr:content");
                            final Instant lastModified = contentNode
                                    .getProperty("jcr:lastModified").getDate().toInstant();
                            final String createdAt = DateTimeFormatter.ISO_INSTANT
                                    .format(lastModified.atOffset(ZoneOffset.UTC));
                            final List<String> siteKeys = new ArrayList<>();
                            if (archive.hasProperty(ProvisioningGeneratorMutationExtension.SITE_KEYS_PROPERTY)) {
                                for (Value value : archive.getProperty(
                                        ProvisioningGeneratorMutationExtension.SITE_KEYS_PROPERTY).getValues()) {
                                    siteKeys.add(value.getString());
                                }
                            }
                            final boolean includesSystemModules = archive.hasProperty(
                                    ProvisioningGeneratorMutationExtension.INCLUDES_SYSTEM_MODULES_PROPERTY)
                                    && archive.getProperty(ProvisioningGeneratorMutationExtension
                                    .INCLUDES_SYSTEM_MODULES_PROPERTY).getBoolean();
                            return new GqlArchiveInfo(createdAt, siteKeys, includesSystemModules);
                        } catch (Exception e) {
                            LOGGER.error("Error reading archive info", e);
                            return null;
                        }
                    });
        } catch (Exception e) {
            LOGGER.error("Error reading archive info", e);
            return null;
        }
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorSites")
    @GraphQLDescription("Sites that can be used to scope the export (all sites except systemsite)")
    @GraphQLRequiresPermission("provisioningGeneratorAdmin")
    public static List<GqlSite> sites() {
        try {
            return BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                    null, Constants.EDIT_WORKSPACE, null, session -> {
                        final List<GqlSite> result = new ArrayList<>();
                        final NodeIterator it = session.getNode("/sites").getNodes();
                        while (it.hasNext()) {
                            final Node site = it.nextNode();
                            if (site.isNodeType("jnt:virtualsite") && !"systemsite".equals(site.getName())) {
                                final String title = site.hasProperty("jcr:title")
                                        ? site.getProperty("jcr:title").getString() : site.getName();
                                result.add(new GqlSite(site.getName(), title));
                            }
                        }
                        return result;
                    });
        } catch (Exception e) {
            LOGGER.error("Error listing sites", e);
            return Collections.emptyList();
        }
    }

    @GraphQLName("ProvisioningSite")
    @GraphQLDescription("A site that can be used to scope the export")
    public static class GqlSite {

        private final String siteKey;
        private final String title;

        public GqlSite(String siteKey, String title) {
            this.siteKey = siteKey;
            this.title = title;
        }

        @GraphQLField
        @GraphQLName("siteKey")
        @GraphQLDescription("Site key")
        public String getSiteKey() {
            return siteKey;
        }

        @GraphQLField
        @GraphQLName("title")
        @GraphQLDescription("Site title")
        public String getTitle() {
            return title;
        }
    }

    @GraphQLName("ProvisioningArchiveInfo")
    @GraphQLDescription("Metadata about the provisioning archive")
    public static class GqlArchiveInfo {

        private final String createdAt;
        private final List<String> siteKeys;
        private final boolean includesSystemModules;

        public GqlArchiveInfo(String createdAt, List<String> siteKeys, boolean includesSystemModules) {
            this.createdAt = createdAt;
            this.siteKeys = siteKeys;
            this.includesSystemModules = includesSystemModules;
        }

        @GraphQLField
        @GraphQLName("createdAt")
        @GraphQLDescription("ISO-8601 timestamp of the last time the archive was generated")
        public String getCreatedAt() {
            return createdAt;
        }

        @GraphQLField
        @GraphQLName("siteKeys")
        @GraphQLDescription("Sites the archive was scoped to; empty when it contains all active modules")
        public List<String> getSiteKeys() {
            return siteKeys;
        }

        @GraphQLField
        @GraphQLName("includesSystemModules")
        @GraphQLDescription("Whether platform modules (Jahia-Module-Type: system) are part of the archive")
        public boolean isIncludesSystemModules() {
            return includesSystemModules;
        }
    }
}

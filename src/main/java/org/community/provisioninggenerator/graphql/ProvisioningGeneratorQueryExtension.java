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
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

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
    @GraphQLRequiresPermission("admin")
    public static Boolean isGenerating() {
        final ProvisioningGeneratorService service = BundleUtils.getOsgiService(ProvisioningGeneratorService.class, null);
        return service != null && service.isGenerating();
    }

    @GraphQLField
    @GraphQLName("provisioningGeneratorArchiveInfo")
    @GraphQLDescription("Returns archive metadata if the provisioning archive exists in JCR, null otherwise")
    @GraphQLRequiresPermission("admin")
    public static GqlArchiveInfo archiveInfo() {
        try {
            return BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                    null, Constants.EDIT_WORKSPACE, null, session -> {
                        final String nodePath = ProvisioningGeneratorMutationExtension.ARCHIVE_JCR_PATH;
                        try {
                            if (!session.nodeExists(nodePath)) {
                                return null;
                            }
                            final Node contentNode = session.getNode(nodePath).getNode("jcr:content");
                            final Instant lastModified = contentNode
                                    .getProperty("jcr:lastModified").getDate().toInstant();
                            final String createdAt = DateTimeFormatter.ISO_INSTANT
                                    .format(lastModified.atOffset(ZoneOffset.UTC));
                            return new GqlArchiveInfo(createdAt);
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

    @GraphQLName("ProvisioningArchiveInfo")
    @GraphQLDescription("Metadata about the provisioning archive")
    public static class GqlArchiveInfo {

        private final String createdAt;

        public GqlArchiveInfo(String createdAt) {
            this.createdAt = createdAt;
        }

        @GraphQLField
        @GraphQLName("createdAt")
        @GraphQLDescription("ISO-8601 timestamp of the last time the archive was generated")
        public String getCreatedAt() {
            return createdAt;
        }
    }
}

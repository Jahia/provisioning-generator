package org.community.provisioninggenerator.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.community.provisioninggenerator.BundleInstall;
import org.community.provisioninggenerator.util.EntryNameSanitizer;
import org.jahia.api.Constants;
import org.jahia.api.content.JCRTemplate;
import org.jahia.api.templates.JahiaTemplateManagerService;
import org.jahia.data.templates.JahiaTemplatesPackage;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Deactivate;
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
import java.util.stream.Collectors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Component(service = ProvisioningGeneratorService.class, immediate = true)
public class ProvisioningGeneratorService {

    private static final Logger logger = LoggerFactory.getLogger(ProvisioningGeneratorService.class);
    private static final String QUERY = "SELECT * FROM [jnt:moduleManagementBundle] WHERE ISDESCENDANTNODE('/module-management/')"
            + " AND [j:groupId]='%s' AND [j:symbolicName]='%s' AND [j:version]='%s'";
    private static final String EXPORT_FILE_PREFIX = "/modulesExport";
    private static final String EXPORT_FILE_SUFFIX = ".zip";
    private static final String MANIFEST_ENTRY_NAME = "provisioning.yaml";

    private final AtomicBoolean generating = new AtomicBoolean(false);
    private ExecutorService executor;

    /**
     * Callback receiving the generated archive while the generation lock is still held.
     */
    @FunctionalInterface
    public interface ArchiveHandler {
        void handle(File archive) throws RepositoryException;
    }

    @Activate
    protected void activate() {
        executor = Executors.newSingleThreadExecutor(runnable -> {
            final Thread thread = new Thread(runnable, "provisioning-generator");
            thread.setDaemon(true);
            return thread;
        });
    }

    @Deactivate
    protected void deactivate() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    public boolean isGenerating() {
        return generating.get();
    }

    /**
     * Generates the archive in the temp folder and returns it.
     *
     * @throws IllegalStateException if a generation is already in progress
     */
    public File generate(String tmpContentDiskPath) throws RepositoryException {
        return generate(tmpContentDiskPath, ExportScope.allModules());
    }

    /**
     * Generates the archive in the temp folder and returns it.
     *
     * @throws IllegalStateException    if a generation is already in progress
     * @throws IllegalArgumentException if a site of the scope does not exist
     */
    public File generate(String tmpContentDiskPath, ExportScope scope) throws RepositoryException {
        validate(tmpContentDiskPath);
        checkSites(scope);
        acquire();
        try {
            return createArchive(tmpContentDiskPath, scope);
        } finally {
            generating.set(false);
        }
    }

    /**
     * Generates the archive and passes it to {@code handler}; {@link #isGenerating()} stays true until the handler returns.
     *
     * @throws IllegalStateException    if a generation is already in progress
     * @throws IllegalArgumentException if a site of the scope does not exist
     */
    public void generate(String tmpContentDiskPath, ExportScope scope, ArchiveHandler handler)
            throws RepositoryException {
        validate(tmpContentDiskPath);
        checkSites(scope);
        acquire();
        try {
            handler.handle(createArchive(tmpContentDiskPath, scope));
        } finally {
            generating.set(false);
        }
    }

    /**
     * Starts the generation in a background thread and returns immediately, so the caller does not depend on
     * HTTP/proxy timeouts. {@link #isGenerating()} stays true until the handler returns.
     *
     * @return false if a generation is already in progress
     * @throws IllegalArgumentException if a site of the scope does not exist
     */
    public boolean generateAsync(String tmpContentDiskPath, ExportScope scope, ArchiveHandler handler)
            throws RepositoryException {
        validate(tmpContentDiskPath);
        checkSites(scope);
        if (!generating.compareAndSet(false, true)) {
            return false;
        }
        try {
            executor.execute(() -> {
                try {
                    handler.handle(createArchive(tmpContentDiskPath, scope));
                } catch (Exception e) {
                    logger.error("Error generating provisioning archive", e);
                } finally {
                    generating.set(false);
                }
            });
        } catch (RejectedExecutionException e) {
            generating.set(false);
            throw e;
        }
        return true;
    }

    private static void validate(String tmpContentDiskPath) {
        if (tmpContentDiskPath == null || tmpContentDiskPath.trim().isEmpty()) {
            throw new IllegalArgumentException("tmpContentDiskPath must not be null or blank");
        }
    }

    /**
     * Checks that every site of the scope exists, so that errors are reported to the caller before a (possibly
     * asynchronous) generation starts.
     */
    protected void checkSites(ExportScope scope) throws RepositoryException {
        final List<String> sites = scope.getSiteKeys();
        if (sites.isEmpty()) {
            return;
        }
        final List<String> missing = BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                null, Constants.EDIT_WORKSPACE, null, session -> {
                    final List<String> result = new ArrayList<>();
                    for (String site : sites) {
                        if (!session.nodeExists("/sites/" + site)
                                || !session.getNode("/sites/" + site).isNodeType("jnt:virtualsite")) {
                            result.add(site);
                        }
                    }
                    return result;
                });
        if (!missing.isEmpty()) {
            throw new IllegalArgumentException("Unknown site(s): " + String.join(", ", missing));
        }
    }

    private void acquire() {
        if (!generating.compareAndSet(false, true)) {
            throw new IllegalStateException("A provisioning archive is already being generated");
        }
    }

    protected File createArchive(String tmpContentDiskPath, ExportScope scope) throws RepositoryException {
        final String filename = tmpContentDiskPath + EXPORT_FILE_PREFIX + System.currentTimeMillis() + EXPORT_FILE_SUFFIX;
        final File file = new File(filename);
        BundleUtils.getOsgiService(JCRTemplate.class, null).doExecuteWithSystemSessionAsUser(
                null, Constants.EDIT_WORKSPACE, null, session -> {
                    try {
                        if (file.createNewFile()) {
                            writeZip(file, filename, modulesToExport(session, scope), session);
                        } else {
                            throw new IOException("Impossible to create file " + filename);
                        }
                    } catch (IOException e) {
                        throw new RepositoryException("Error when creating zip", e);
                    }
                    return null;
                });
        return file;
    }

    private static List<JahiaTemplatesPackage> modulesToExport(JCRSessionWrapper session, ExportScope scope)
            throws RepositoryException {
        final JahiaTemplateManagerService templateManagerService =
                BundleUtils.getOsgiService(JahiaTemplateManagerService.class, null);
        final List<JahiaTemplatesPackage> candidates = scope.isSiteScoped()
                ? new SiteModuleResolver(templateManagerService).resolve(session, scope.getSiteKeys())
                : templateManagerService.getAvailableTemplatePackages().stream()
                        .filter(JahiaTemplatesPackage::isActiveVersion)
                        .collect(Collectors.toList());
        // Platform modules are resolved as dependencies but, by default, not exported: they ship with Jahia
        final List<JahiaTemplatesPackage> modules = candidates.stream()
                .filter(module -> scope.exports(module.getModuleType()))
                .collect(Collectors.toList());
        logger.info("Exporting {} of {} modules (sites: {}, platform modules included: {})", modules.size(),
                candidates.size(), scope.isSiteScoped() ? scope.getSiteKeys() : "all", scope.isIncludeSystemModules());
        return modules;
    }

    private void writeZip(File file, String filename, List<JahiaTemplatesPackage> modules, JCRSessionWrapper session)
            throws IOException {
        try (FileOutputStream os = new FileOutputStream(file);
             ZipOutputStream zipOutputStream = new ZipOutputStream(os)) {
            logger.info("Module Export started, this may take some time");
            final ObjectMapper objectMapper = new ObjectMapper(new YAMLFactory());
            final List<BundleInstall> bundleKeys = new ArrayList<>();
            modules.forEach(module -> {
                logger.info(module.getBundleKey());
                final String query = String.format(QUERY, module.getGroupId(),
                        module.getBundle().getSymbolicName(), module.getBundle().getVersion().toString());
                try {
                    final NodeIterator nodeIterator = session.getWorkspace().getQueryManager()
                            .createQuery(query, Query.JCR_SQL2).execute().getNodes();
                    while (nodeIterator.hasNext()) {
                        compressNode((JCRNodeWrapper) nodeIterator.nextNode(), zipOutputStream, bundleKeys);
                    }
                } catch (RepositoryException e) {
                    logger.error("Impossible to retrieve module", e);
                }
            });
            final ZipEntry zipEntry = new ZipEntry(MANIFEST_ENTRY_NAME);
            zipOutputStream.putNextEntry(zipEntry);
            zipOutputStream.write(objectMapper.writer().writeValueAsBytes(bundleKeys));
            zipOutputStream.closeEntry();
            logger.info("Modules Export has been done, the file can be found at: {}", filename);
        }
    }

    private void compressNode(JCRNodeWrapper node, ZipOutputStream zipOutputStream, List<BundleInstall> bundleKeys) {
        final String nodeName = EntryNameSanitizer.sanitize(node.getName());
        if (nodeName == null) {
            logger.warn("Skipping node with unsafe name");
            return;
        }
        logger.info("Compressing Node: {}", nodeName);
        try {
            final Node fileContent = node.getNode("jcr:content");
            try (InputStream content = fileContent.getProperty("jcr:data").getBinary().getStream()) {
                final byte[] buffer = StreamUtils.copyToByteArray(content);
                final ZipEntry zipEntry = new ZipEntry(nodeName);
                bundleKeys.add(new BundleInstall(nodeName));
                zipOutputStream.putNextEntry(zipEntry);
                zipOutputStream.write(buffer);
                zipOutputStream.closeEntry();
            }
        } catch (IOException | RepositoryException e) {
            logger.error("Impossible to retrieve module content", e);
        }
    }
}

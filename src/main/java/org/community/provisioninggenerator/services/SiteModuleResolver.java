package org.community.provisioninggenerator.services;

import org.community.provisioninggenerator.util.DependencyGraph;
import org.jahia.api.templates.JahiaTemplateManagerService;
import org.jahia.data.templates.JahiaTemplatesPackage;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.decorator.JCRSiteNode;
import org.osgi.framework.Bundle;
import org.osgi.framework.namespace.BundleNamespace;
import org.osgi.framework.namespace.PackageNamespace;
import org.osgi.framework.wiring.BundleWire;
import org.osgi.framework.wiring.BundleWiring;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.RepositoryException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Computes the modules needed by a set of sites: their template set, the modules deployed on them, and all transitive
 * dependencies, both declared ({@code Jahia-Depends}) and actual OSGi wiring (imported packages / required bundles
 * provided by another Jahia module). Only Jahia modules are returned: they are the only bundles stored under
 * {@code /module-management/} and installable with {@code installBundle}; other providers are expected to be part of
 * the target platform.
 */
class SiteModuleResolver {

    private static final Logger logger = LoggerFactory.getLogger(SiteModuleResolver.class);

    private final JahiaTemplateManagerService templateManagerService;

    SiteModuleResolver(JahiaTemplateManagerService templateManagerService) {
        this.templateManagerService = templateManagerService;
    }

    /**
     * @return the active modules to export, dependencies before dependents
     */
    List<JahiaTemplatesPackage> resolve(JCRSessionWrapper session, Collection<String> siteKeys) throws RepositoryException {
        final Set<String> moduleIds = new LinkedHashSet<>();
        for (String siteKey : siteKeys) {
            final JCRSiteNode site = (JCRSiteNode) session.getNode("/sites/" + siteKey);
            if (site.getTemplateFolder() != null) {
                moduleIds.add(site.getTemplateFolder());
            }
            moduleIds.addAll(site.getInstalledModulesWithAllDependencies());
        }

        final List<JahiaTemplatesPackage> roots = new ArrayList<>();
        for (String moduleId : moduleIds) {
            final JahiaTemplatesPackage module = templateManagerService.getTemplatePackageById(moduleId);
            if (module != null && module.isActiveVersion()) {
                roots.add(module);
            } else {
                logger.warn("Module {} used by the selected sites has no active version, it is not exported", moduleId);
            }
        }
        return DependencyGraph.resolve(roots, this::dependencies);
    }

    private Collection<JahiaTemplatesPackage> dependencies(JahiaTemplatesPackage module) {
        final Set<JahiaTemplatesPackage> result = new LinkedHashSet<>();
        for (JahiaTemplatesPackage dependency : module.getDependencies()) {
            if (dependency.isActiveVersion()) {
                result.add(dependency);
            }
        }
        result.addAll(wiredModules(module.getBundle()));
        return result;
    }

    private static Collection<JahiaTemplatesPackage> wiredModules(Bundle bundle) {
        final Set<JahiaTemplatesPackage> result = new LinkedHashSet<>();
        final BundleWiring wiring = bundle != null ? bundle.adapt(BundleWiring.class) : null;
        if (wiring == null) {
            return result;
        }
        final List<BundleWire> wires = new ArrayList<>(wiring.getRequiredWires(PackageNamespace.PACKAGE_NAMESPACE));
        wires.addAll(wiring.getRequiredWires(BundleNamespace.BUNDLE_NAMESPACE));
        for (BundleWire wire : wires) {
            final Bundle provider = wire.getProviderWiring().getBundle();
            if (provider.getBundleId() != bundle.getBundleId() && BundleUtils.isJahiaModuleBundle(provider)) {
                final JahiaTemplatesPackage module = BundleUtils.getModule(provider);
                if (module != null && module.isActiveVersion()) {
                    result.add(module);
                }
            }
        }
        return result;
    }
}

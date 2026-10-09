package org.community.provisioninggenerator.services;

import org.community.provisioninggenerator.util.SiteKeys;

import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * What a generation exports: all active modules or the modules used by some sites (with their dependencies), and
 * whether platform modules ({@code Jahia-Module-Type: system}, shipped with Jahia) are written to the archive.
 */
public final class ExportScope {

    static final String SYSTEM_MODULE_TYPE = "system";

    private final List<String> siteKeys;
    private final boolean includeSystemModules;

    private ExportScope(List<String> siteKeys, boolean includeSystemModules) {
        this.siteKeys = Collections.unmodifiableList(siteKeys);
        this.includeSystemModules = includeSystemModules;
    }

    /**
     * @param siteKeys             sites to scope the export to; null or empty for all active modules
     * @param includeSystemModules whether platform modules are exported
     * @throws IllegalArgumentException if a site key is invalid
     */
    public static ExportScope of(Collection<String> siteKeys, boolean includeSystemModules) {
        return new ExportScope(SiteKeys.normalize(siteKeys), includeSystemModules);
    }

    /**
     * All active modules except platform modules.
     */
    public static ExportScope allModules() {
        return of(Collections.emptyList(), false);
    }

    public List<String> getSiteKeys() {
        return siteKeys;
    }

    public boolean isSiteScoped() {
        return !siteKeys.isEmpty();
    }

    public boolean isIncludeSystemModules() {
        return includeSystemModules;
    }

    /**
     * Whether a module of the given {@code Jahia-Module-Type} is written to the archive. Dependencies are always
     * resolved through platform modules; this only filters what ends up in the archive.
     */
    public boolean exports(String moduleType) {
        return includeSystemModules || !SYSTEM_MODULE_TYPE.equals(moduleType);
    }
}

package org.community.provisioninggenerator.util;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Normalization and validation of the site keys used to scope an export.
 */
public final class SiteKeys {

    // Site keys are JCR node names under /sites: reject anything that could escape that folder
    private static final Pattern VALID_SITE_KEY = Pattern.compile("[A-Za-z0-9_.-]+");

    private SiteKeys() {
    }

    /**
     * Trims and de-duplicates the given keys, preserving order.
     *
     * @return an empty list when {@code siteKeys} is null or empty (meaning "all modules")
     * @throws IllegalArgumentException if a key is blank or contains characters not allowed in a site key
     */
    public static List<String> normalize(Collection<String> siteKeys) {
        if (siteKeys == null || siteKeys.isEmpty()) {
            return Collections.emptyList();
        }
        final Set<String> result = new LinkedHashSet<>();
        for (String siteKey : siteKeys) {
            final String trimmed = siteKey == null ? "" : siteKey.trim();
            if (trimmed.isEmpty() || ".".equals(trimmed) || "..".equals(trimmed)
                    || !VALID_SITE_KEY.matcher(trimmed).matches()) {
                throw new IllegalArgumentException("Invalid site key: " + siteKey);
            }
            result.add(trimmed);
        }
        return new ArrayList<>(result);
    }
}

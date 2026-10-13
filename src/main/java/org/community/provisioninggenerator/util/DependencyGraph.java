package org.community.provisioninggenerator.util;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/**
 * Transitive dependency resolution.
 */
public final class DependencyGraph {

    private DependencyGraph() {
    }

    /**
     * Returns the roots and all their transitive dependencies, each element once, dependencies before their dependents
     * (a valid install order). The order is deterministic for a deterministic {@code dependencies} function; cycles are
     * tolerated (elements of a cycle are emitted once, in discovery order).
     */
    public static <T> List<T> resolve(Collection<T> roots, Function<T, Collection<T>> dependencies) {
        final List<T> ordered = new ArrayList<>();
        final Set<T> visited = new HashSet<>();
        for (T root : roots) {
            visit(root, dependencies, visited, ordered);
        }
        return ordered;
    }

    private static <T> void visit(T node, Function<T, Collection<T>> dependencies, Set<T> visited, List<T> ordered) {
        if (node == null || !visited.add(node)) {
            return;
        }
        final Collection<T> deps = dependencies.apply(node);
        for (T dep : deps != null ? deps : Collections.<T>emptyList()) {
            visit(dep, dependencies, visited, ordered);
        }
        ordered.add(node);
    }
}

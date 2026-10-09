package org.community.provisioninggenerator.util;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

public class DependencyGraphTest {

    private static Function<String, Collection<String>> graph(String... edges) {
        final Map<String, List<String>> map = new HashMap<>();
        for (String edge : edges) {
            final String[] parts = edge.split("->");
            map.put(parts[0], Arrays.asList(parts[1].split(",")));
        }
        return node -> map.getOrDefault(node, Collections.emptyList());
    }

    @Test
    public void includesTransitiveDependenciesBeforeDependents() {
        // Arrange
        final Function<String, Collection<String>> deps = graph("site->a,b", "a->c", "c->d");

        // Act
        final List<String> result = DependencyGraph.resolve(Collections.singletonList("site"), deps);

        // Assert
        assertThat(result).containsExactly("d", "c", "a", "b", "site");
    }

    @Test
    public void emitsSharedDependenciesOnce() {
        // Arrange
        final Function<String, Collection<String>> deps = graph("s1->common", "s2->common", "common->base");

        // Act
        final List<String> result = DependencyGraph.resolve(Arrays.asList("s1", "s2"), deps);

        // Assert
        assertThat(result).containsExactly("base", "common", "s1", "s2");
    }

    @Test
    public void toleratesCycles() {
        // Arrange
        final Function<String, Collection<String>> deps = graph("a->b", "b->a");

        // Act
        final List<String> result = DependencyGraph.resolve(Collections.singletonList("a"), deps);

        // Assert
        assertThat(result).containsExactlyInAnyOrder("a", "b");
    }

    @Test
    public void ignoresNullRootsAndNullDependencyLists() {
        // Act
        final List<String> result = DependencyGraph.resolve(Arrays.asList("a", null), node -> null);

        // Assert
        assertThat(result).containsExactly("a");
    }
}

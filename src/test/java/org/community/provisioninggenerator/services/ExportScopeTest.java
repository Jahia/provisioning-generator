package org.community.provisioninggenerator.services;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

public class ExportScopeTest {

    @Test
    public void allModulesExcludesPlatformModules() {
        // Act
        final ExportScope scope = ExportScope.allModules();

        // Assert
        assertThat(scope.isSiteScoped()).isFalse();
        assertThat(scope.exports("system")).isFalse();
        assertThat(scope.exports("module")).isTrue();
        assertThat(scope.exports("templatesSet")).isTrue();
        assertThat(scope.exports(null)).isTrue();
    }

    @Test
    public void includesPlatformModulesWhenRequested() {
        // Act
        final ExportScope scope = ExportScope.of(null, true);

        // Assert
        assertThat(scope.exports("system")).isTrue();
    }

    @Test
    public void normalizesSiteKeys() {
        // Act
        final ExportScope scope = ExportScope.of(Arrays.asList(" a ", "b", "a"), false);

        // Assert
        assertThat(scope.isSiteScoped()).isTrue();
        assertThat(scope.getSiteKeys()).containsExactly("a", "b");
    }

    @Test
    public void rejectsInvalidSiteKeys() {
        assertThatThrownBy(() -> ExportScope.of(Collections.singletonList("../x"), false))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

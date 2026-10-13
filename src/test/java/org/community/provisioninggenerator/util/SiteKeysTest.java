package org.community.provisioninggenerator.util;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

public class SiteKeysTest {

    @Test
    public void returnsEmptyListForNullOrEmptyInput() {
        assertThat(SiteKeys.normalize(null)).isEmpty();
        assertThat(SiteKeys.normalize(Collections.emptyList())).isEmpty();
    }

    @Test
    public void trimsAndDeduplicatesPreservingOrder() {
        // Act
        final java.util.List<String> result = SiteKeys.normalize(Arrays.asList(" digitall ", "academy", "digitall"));

        // Assert
        assertThat(result).containsExactly("digitall", "academy");
    }

    @Test
    public void rejectsPathTraversalAndSeparators() {
        assertThatThrownBy(() -> SiteKeys.normalize(Collections.singletonList("..")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SiteKeys.normalize(Collections.singletonList("a/b")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SiteKeys.normalize(Collections.singletonList("a\\b")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    public void rejectsBlankKeys() {
        assertThatThrownBy(() -> SiteKeys.normalize(Arrays.asList("ok", " ")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SiteKeys.normalize(Collections.singletonList(null)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

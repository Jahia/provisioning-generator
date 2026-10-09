package org.community.provisioninggenerator.services;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

public class ProvisioningGeneratorServiceTest {

    private static final String TMP_PATH = "/tmp";
    private static final File ARCHIVE = new File(TMP_PATH, "modulesExport0.zip");

    private final CountDownLatch started = new CountDownLatch(1);
    private final CountDownLatch release = new CountDownLatch(1);
    private ProvisioningGeneratorService service;

    @Before
    public void setUp() {
        service = new ProvisioningGeneratorService() {
            @Override
            protected File createArchive(String tmpContentDiskPath) {
                started.countDown();
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return ARCHIVE;
            }
        };
        service.activate();
    }

    @After
    public void tearDown() {
        release.countDown();
        service.deactivate();
    }

    @Test
    public void generateAsyncReturnsImmediatelyAndStaysGeneratingUntilHandlerReturns() throws Exception {
        // Arrange
        final AtomicReference<File> handled = new AtomicReference<>();
        final CountDownLatch handlerDone = new CountDownLatch(1);

        // Act
        final boolean accepted = service.generateAsync(TMP_PATH, archive -> {
            handled.set(archive);
            handlerDone.countDown();
        });

        // Assert
        assertThat(accepted).isTrue();
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(service.isGenerating()).isTrue();

        release.countDown();
        assertThat(handlerDone.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(handled.get()).isEqualTo(ARCHIVE);
        waitUntilIdle();
        assertThat(service.isGenerating()).isFalse();
    }

    @Test
    public void generateAsyncIsRejectedWhileAGenerationIsInProgress() throws Exception {
        // Arrange
        service.generateAsync(TMP_PATH, archive -> { });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        // Act
        final boolean accepted = service.generateAsync(TMP_PATH, archive -> { });

        // Assert
        assertThat(accepted).isFalse();
    }

    @Test
    public void synchronousGenerateIsRejectedWhileAGenerationIsInProgress() throws Exception {
        // Arrange
        service.generateAsync(TMP_PATH, archive -> { });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        // Act / Assert
        assertThatThrownBy(() -> service.generate(TMP_PATH, archive -> { }))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    public void generatingFlagIsResetWhenHandlerFails() throws Exception {
        // Arrange
        release.countDown();

        // Act
        service.generateAsync(TMP_PATH, archive -> {
            throw new javax.jcr.RepositoryException("boom");
        });

        // Assert
        waitUntilIdle();
        assertThat(service.isGenerating()).isFalse();
        assertThat(service.generateAsync(TMP_PATH, archive -> { })).isTrue();
    }

    @Test
    public void rejectsBlankTmpPath() {
        assertThatThrownBy(() -> service.generateAsync(" ", archive -> { }))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(service.isGenerating()).isFalse();
    }

    private void waitUntilIdle() throws InterruptedException {
        final long deadline = System.currentTimeMillis() + 5000;
        while (service.isGenerating() && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
    }
}

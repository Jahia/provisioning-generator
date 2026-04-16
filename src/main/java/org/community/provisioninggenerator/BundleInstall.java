package org.community.provisioninggenerator;

import org.jahia.settings.SettingsBean;

public class BundleInstall {

    private final String installBundle;
    private static final boolean AUTO_START = true;
    private final String prefix = "file://" + SettingsBean.getInstance().getTmpContentDiskPath() + "/";

    public BundleInstall(String installBundle) {
        this.installBundle = prefix + installBundle;
    }

    public String getInstallBundle() {
        return installBundle;
    }

    public boolean isAutoStart() {
        return AUTO_START;
    }

}

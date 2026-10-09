import React from 'react';
import {useTranslation} from 'react-i18next';
import {Banner, Button, Delete, Download, FileZip, Loader, Typography} from '@jahia/moonstone';
import styles from './ProvisioningGenerator.scss';

export const ARCHIVE_FILENAME = 'provisioning-export.zip';
const DOWNLOAD_URL = `/files/default/sites/systemsite/files/provisioning-generator/${ARCHIVE_FILENAME}`;

const formatDate = isoString => {
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(isoString));
    } catch {
        return isoString;
    }
};

export const archiveScope = (archiveInfo, t) => {
    const modules = archiveInfo.siteKeys && archiveInfo.siteKeys.length > 0 ?
        t('label.archiveScopeSites', {sites: archiveInfo.siteKeys.join(', ')}) :
        t('label.archiveScopeAll');
    const platform = archiveInfo.includesSystemModules ?
        t('label.archivePlatformIncluded') :
        t('label.archivePlatformExcluded');
    return `${modules} · ${platform}`;
};

// Visible feedback for the last action, also announced through the page live regions
const BANNERS = {
    success: {variant: 'info', title: 'label.successTitle', body: 'label.success'},
    timeout: {variant: 'warning', title: 'label.timeoutTitle', body: 'label.timeout'},
    error: {variant: 'danger', title: 'label.errorTitle', body: 'label.error'},
    deleted: {variant: 'neutral', title: 'label.deletedTitle', body: 'label.deleted'}
};

export const StatusBanner = ({status}) => {
    const {t} = useTranslation('provisioning-generator');
    const banner = BANNERS[status];
    if (!banner) {
        return null;
    }

    return (
        <Banner variant={banner.variant} title={t(banner.title)} className={styles.pg_banner}>
            {t(banner.body)}
        </Banner>
    );
};

export const Progress = ({label}) => (
    /* SC 4.1.3: aria-hidden prevents duplicate announcement, the page polite live region announces it */
    <div className={styles.pg_progress} aria-hidden="true">
        <Loader size="small"/>
        <Typography variant="body" className={styles.pg_muted}>{label}</Typography>
    </div>
);

const ArchiveActions = ({isBusy, isDeleting, onDelete}) => {
    const {t} = useTranslation('provisioning-generator');
    if (isDeleting) {
        return <Progress label={t('label.deleting')}/>;
    }

    if (isBusy) {
        return null;
    }

    return (
        <div className={styles.pg_archive_actions}>
            {/* SC 2.4.4: aria-label adds explicit file-type context for AT users */}
            <a
                href={DOWNLOAD_URL}
                download={ARCHIVE_FILENAME}
                className={styles.pg_download_link}
                aria-label={t('label.downloadAriaLabel')}
            >
                <Download aria-hidden="true"/>
                <span>{t('label.download')}</span>
            </a>
            <Button
                label={t('label.delete')}
                variant="ghost"
                color="danger"
                icon={<Delete/>}
                onClick={onDelete}
            />
        </div>
    );
};

export const ArchivePanel = ({archiveInfo, isBusy, isDeleting, headingRef, onDelete}) => {
    const {t} = useTranslation('provisioning-generator');
    return (
        <section className={styles.pg_section} aria-labelledby="pg-archive-heading">
            <Typography
                ref={headingRef}
                id="pg-archive-heading"
                variant="heading"
                component="h3"
                tabIndex={-1}
                className={styles.pg_section_title}
            >
                {t('label.archiveHeading')}
            </Typography>
            {archiveInfo ? (
                <div className={styles.pg_archive}>
                    <div className={styles.pg_archive_file}>
                        <span className={styles.pg_archive_icon} aria-hidden="true"><FileZip/></span>
                        <div className={styles.pg_archive_meta}>
                            <Typography variant="body" weight="bold" className={styles.pg_archive_name}>
                                {ARCHIVE_FILENAME}
                            </Typography>
                            <Typography variant="caption" className={styles.pg_muted}>
                                {t('label.createdAt', {date: formatDate(archiveInfo.createdAt)})}
                            </Typography>
                            <Typography variant="caption" className={styles.pg_muted}>
                                {archiveScope(archiveInfo, t)}
                            </Typography>
                        </div>
                    </div>
                    <ArchiveActions isBusy={isBusy} isDeleting={isDeleting} onDelete={onDelete}/>
                </div>
            ) : (
                <Typography variant="body" className={`${styles.pg_empty} ${styles.pg_muted}`}>
                    {t('label.noArchive')}
                </Typography>
            )}
        </section>
    );
};

export default ArchivePanel;

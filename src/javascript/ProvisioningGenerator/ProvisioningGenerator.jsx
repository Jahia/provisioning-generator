import React, {useEffect, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import {useTranslation} from 'react-i18next';
import {Button, Loader, Typography} from '@jahia/moonstone';
import styles from './ProvisioningGenerator.scss';
import {DELETE_PROVISIONING_ARCHIVE, GENERATE_PROVISIONING_ARCHIVE, GET_ARCHIVE_INFO} from './ProvisioningGenerator.gql';

const DOWNLOAD_URL = '/files/default/sites/systemsite/files/provisioning-generator/provisioning-export.zip';
const POLL_INTERVAL_MS = 2000;

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

export const ProvisioningGeneratorAdmin = () => {
    const {t} = useTranslation('provisioning-generator');
    const [generateStatus, setGenerateStatus] = useState(null);

    // SC 2.4.2: update page title on SPA route activation
    useEffect(() => {
        document.title = `${t('label.title')} — Jahia Administration`;
    }, [t]);

    const {data: infoData, refetch: refetchInfo, startPolling, stopPolling} = useQuery(GET_ARCHIVE_INFO, {
        fetchPolicy: 'network-only'
    });

    const serverGenerating = infoData && infoData.provisioningGeneratorIsGenerating === true;
    const archiveInfo = infoData && infoData.provisioningGeneratorArchiveInfo;

    useEffect(() => {
        if (serverGenerating) {
            startPolling(POLL_INTERVAL_MS);
        } else {
            stopPolling();
        }

        return () => stopPolling();
    }, [serverGenerating, startPolling, stopPolling]);

    const [generate, {loading: mutationGenerating}] = useMutation(GENERATE_PROVISIONING_ARCHIVE);
    const [deleteArchive, {loading: deleting}] = useMutation(DELETE_PROVISIONING_ARCHIVE, {
        refetchQueries: [{query: GET_ARCHIVE_INFO}]
    });

    const generating = mutationGenerating || serverGenerating;
    const isLoading = generating || deleting;

    const handleGenerate = async () => {
        setGenerateStatus(null);
        try {
            const result = await generate();
            if (result.data && result.data.provisioningGeneratorGenerate) {
                setGenerateStatus('success');
                refetchInfo();
            } else {
                setGenerateStatus('error');
            }
        } catch (err) {
            console.error('Failed to generate provisioning archive:', err);
            setGenerateStatus('error');
        }
    };

    const handleDelete = async () => {
        // SC 3.3.4: require explicit confirmation before irreversible delete
        if (!window.confirm(t('label.deleteConfirm'))) {
            return;
        }

        setGenerateStatus(null);
        try {
            await deleteArchive();
        } catch (err) {
            console.error('Failed to delete provisioning archive:', err);
        }
    };

    return (
        <div className={styles.pg_container}>
            {/* SC 4.1.3: two fixed-role live regions always in DOM — AT registers roles at mount */}
            <div role="status" aria-live="polite" aria-atomic="true" className={styles.pg_sr_only}>
                {generateStatus === 'success' ? t('label.success') :
                    generating ? t('label.generating') :
                    deleting ? t('label.deleting') : ''}
            </div>
            <div role="alert" aria-live="assertive" aria-atomic="true" className={styles.pg_sr_only}>
                {generateStatus === 'error' ? t('label.error') : ''}
            </div>

            <div className={styles.pg_header}>
                {/* MIN-03: title fallback for ellipsis-truncated heading */}
                <h2 title={t('label.title')}>{t('label.title')}</h2>
            </div>

            <div className={styles.pg_description}>
                <Typography>{t('label.description')}</Typography>
            </div>

            {generateStatus === 'success' && (
                <div aria-hidden="true" className={`${styles.pg_alert} ${styles['pg_alert--success']}`}>
                    {t('label.success')}
                </div>
            )}
            {generateStatus === 'error' && (
                <div aria-hidden="true" className={`${styles.pg_alert} ${styles['pg_alert--error']}`}>
                    {t('label.error')}
                </div>
            )}

            <div className={styles.pg_actions}>
                {isLoading ? (
                    /* SC 4.1.3: aria-hidden so visible loading text doesn't duplicate the sr-only polite region */
                    <div className={styles.pg_loading} aria-hidden="true">
                        <Loader size="big" aria-hidden="true"/>
                        <Typography className={styles.pg_loading_text}>
                            {generating ? t('label.generating') : t('label.deleting')}
                        </Typography>
                    </div>
                ) : (
                    <Button
                        type="button"
                        label={t('label.generate')}
                        variant="primary"
                        isDisabled={isLoading}
                        onClick={handleGenerate}
                    />
                )}
            </div>

            {archiveInfo && !isLoading && (
                <div className={styles.pg_archive_section}>
                    <p className={styles.pg_created_at}>
                        {t('label.createdAt', {date: formatDate(archiveInfo.createdAt)})}
                    </p>
                    <div className={styles.pg_archive_actions}>
                        {/* SC 2.4.4: aria-label adds explicit file-type context for AT users */}
                        <a
                            href={DOWNLOAD_URL}
                            download="provisioning-export.zip"
                            className={styles.pg_download_link}
                            aria-label={t('label.downloadAriaLabel')}
                        >
                            {t('label.download')}
                        </a>
                        <button
                            type="button"
                            className={styles.pg_delete_btn}
                            onClick={handleDelete}
                        >
                            {t('label.delete')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProvisioningGeneratorAdmin;

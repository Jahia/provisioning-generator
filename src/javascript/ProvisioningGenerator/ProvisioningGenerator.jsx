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
        setGenerateStatus(null);
        try {
            await deleteArchive();
        } catch (err) {
            console.error('Failed to delete provisioning archive:', err);
        }
    };

    return (
        <div className={styles.pg_container}>
            <div className={styles.pg_header}>
                <h2>{t('label.title')}</h2>
            </div>

            <div className={styles.pg_description}>
                <Typography>{t('label.description')}</Typography>
            </div>

            {generateStatus === 'success' && (
                <div className={`${styles.pg_alert} ${styles['pg_alert--success']}`}>
                    {t('label.success')}
                </div>
            )}
            {generateStatus === 'error' && (
                <div className={`${styles.pg_alert} ${styles['pg_alert--error']}`}>
                    {t('label.error')}
                </div>
            )}

            <div className={styles.pg_actions}>
                {isLoading ? (
                    <div className={styles.pg_loading}>
                        <Loader size="big"/>
                        <Typography className={styles.pg_loading_text}>
                            {generating ? t('label.generating') : t('label.deleting')}
                        </Typography>
                    </div>
                ) : (
                    <Button
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
                        <a
                            href={DOWNLOAD_URL}
                            download="provisioning-export.zip"
                            className={styles.pg_download_link}
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

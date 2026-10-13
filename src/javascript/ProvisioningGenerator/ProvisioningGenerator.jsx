import React, {useEffect, useRef, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import {useTranslation} from 'react-i18next';
import {Button, Loader, Typography} from '@jahia/moonstone';
import styles from './ProvisioningGenerator.scss';
import {DELETE_PROVISIONING_ARCHIVE, GENERATE_PROVISIONING_ARCHIVE, GET_ARCHIVE_INFO} from './ProvisioningGenerator.gql';

const DOWNLOAD_URL = '/files/default/sites/systemsite/files/provisioning-generator/provisioning-export.zip';
const POLL_INTERVAL_MS = 2000;

// Statuses (or a non-JSON body) returned by a reverse proxy that gave up waiting for Jahia
const PROXY_TIMEOUT_STATUSES = [408, 502, 503, 504];

const isProxyTimeout = err => {
    const networkError = err && err.networkError;
    return Boolean(networkError) &&
        (PROXY_TIMEOUT_STATUSES.includes(networkError.statusCode) || networkError.name === 'ServerParseError');
};

const wait = ms => new Promise(resolve => {
    setTimeout(resolve, ms);
});

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
    const [awaitingArchive, setAwaitingArchive] = useState(false);
    const mountedRef = useRef(true);
    const generateBtnRef = useRef(null);
    const prevIsLoadingRef = useRef(false);

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

    const generating = mutationGenerating || serverGenerating || awaitingArchive;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);
    const isLoading = generating || deleting;

    // SC 2.4.3: return keyboard focus to Generate button when loading completes
    useEffect(() => {
        if (prevIsLoadingRef.current && !isLoading) {
            generateBtnRef.current?.focus();
        }

        prevIsLoadingRef.current = isLoading;
    }, [isLoading]);

    // The generation runs in the background on the server (async: true) so the request returns immediately
    // and should not be cut by a reverse-proxy timeout. Completion is detected by polling isGenerating, and
    // success by a new archive creation date. If a generation was already running, we simply wait for it.
    // If a proxy still times out, the server keeps working: warn the user and keep polling instead of failing.
    const handleGenerate = async () => {
        setGenerateStatus(null);
        setAwaitingArchive(true);
        const previousCreatedAt = archiveInfo ? archiveInfo.createdAt : null;
        try {
            try {
                await generate({variables: {async: true}});
            } catch (err) {
                if (!isProxyTimeout(err)) {
                    throw err;
                }

                setGenerateStatus('timeout');
            }

            let info = (await refetchInfo()).data;
            while (mountedRef.current && info && info.provisioningGeneratorIsGenerating) {
                // eslint-disable-next-line no-await-in-loop
                await wait(POLL_INTERVAL_MS);
                // eslint-disable-next-line no-await-in-loop
                info = (await refetchInfo()).data;
            }

            const newArchive = info && info.provisioningGeneratorArchiveInfo;
            setGenerateStatus(newArchive && newArchive.createdAt !== previousCreatedAt ? 'success' : 'error');
        } catch {
            setGenerateStatus('error');
            refetchInfo().catch(() => {});
        } finally {
            setAwaitingArchive(false);
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
        } catch (_err) {
            setGenerateStatus('error');
        }
    };

    return (
        <div className={styles.pg_container}>
            {/* SC 4.1.3: two fixed-role live regions always in DOM — AT registers roles at mount.
                Polite region: success, proxy-timeout warning and loading states. Assertive region: errors only.
                Visible alert divs below are aria-hidden; live regions are the sole AT announcement path. */}
            <div role="status" aria-live="polite" aria-atomic="true" className={styles.pg_sr_only}>
                {generateStatus === 'success' ? t('label.success') :
                    generateStatus === 'timeout' ? t('label.timeout') :
                    generating ? t('label.generating') :
                    deleting ? t('label.deleting') : ''}
            </div>
            <div role="alert" aria-live="assertive" aria-atomic="true" className={styles.pg_sr_only}>
                {generateStatus === 'error' ? t('label.error') : ''}
            </div>

            <div className={styles.pg_header}>
                {/* CRIT-02: component starts at h2; Jahia admin shell is expected to provide an h1 landmark.
                    MIN-03: title attribute provides tooltip fallback for ellipsis-truncated text */}
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
            {generateStatus === 'timeout' && (
                <div aria-hidden="true" className={`${styles.pg_alert} ${styles['pg_alert--warning']}`}>
                    {t('label.timeout')}
                </div>
            )}
            {generateStatus === 'error' && (
                <div aria-hidden="true" className={`${styles.pg_alert} ${styles['pg_alert--error']}`}>
                    {t('label.error')}
                </div>
            )}

            <div className={styles.pg_actions}>
                {isLoading ? (
                    /* SC 4.1.3: aria-hidden prevents duplicate announcement — polite live region above
                       handles the loading state announcement for AT */
                    <div className={styles.pg_loading} aria-hidden="true">
                        <Loader size="big" aria-hidden="true"/>
                        <Typography className={styles.pg_loading_text}>
                            {generating ? t('label.generating') : t('label.deleting')}
                        </Typography>
                    </div>
                ) : (
                    <Button
                        ref={generateBtnRef}
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
                        {/* MIN-06: accessible name "Delete archive" is unique in this single-instance component.
                            If this component is ever rendered in a list, add aria-label with item context. */}
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

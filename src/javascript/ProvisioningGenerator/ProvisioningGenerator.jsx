import React, {useEffect, useRef, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import {useTranslation} from 'react-i18next';
import {Archive, Button, Typography} from '@jahia/moonstone';
import styles from './ProvisioningGenerator.scss';
import {ScopeSelector, SelectSiteHint, useSiteScope} from './ScopeSelector';
import {ArchivePanel, Progress, StatusBanner, archiveScope} from './ArchivePanel';
import {DELETE_PROVISIONING_ARCHIVE, GENERATE_PROVISIONING_ARCHIVE, GET_ARCHIVE_INFO} from './ProvisioningGenerator.gql';

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

// SC 4.1.3: the success announcement includes the scope shown in the archive section
const successMessage = (archiveInfo, t) => (archiveInfo ?
    `${t('label.success')} ${archiveScope(archiveInfo, t)}` :
    t('label.success'));

// Moves focus to `heading` when `isWorking` turns true, and to `target()` when it turns false again
const useFocusDuringWork = (isWorking, heading, target) => {
    const wasWorking = useRef(false);
    useEffect(() => {
        if (isWorking && !wasWorking.current) {
            heading.current?.focus();
        } else if (!isWorking && wasWorking.current) {
            target()?.focus();
        }

        wasWorking.current = isWorking;
    }, [isWorking, heading, target]);
};

// SC 4.1.3: message of the polite live region
const politeMessage = (status, {archiveInfo, generating, deleting}, t) => {
    if (status === 'success') {
        return successMessage(archiveInfo, t);
    }

    if (status === 'timeout' || status === 'deleted') {
        return t(`label.${status}`);
    }

    if (generating) {
        return t('label.generating');
    }

    return deleting ? t('label.deleting') : '';
};

const sitesOf = infoData => (infoData && infoData.provisioningGeneratorSites) || [];

export const ProvisioningGeneratorAdmin = () => {
    const {t} = useTranslation('provisioning-generator');
    const [generateStatus, setGenerateStatus] = useState(null);
    const [awaitingArchive, setAwaitingArchive] = useState(false);
    const scopeState = useSiteScope();
    const {noSiteSelected, hintId, siteKeys, includeSystemModules} = scopeState;
    const mountedRef = useRef(true);
    const actionsRef = useRef(null);
    const generateHeadingRef = useRef(null);
    const archiveHeadingRef = useRef(null);

    // SC 2.4.2: update page title on SPA route activation
    useEffect(() => {
        document.title = `${t('label.title')} — Jahia Administration`;
    }, [t]);

    const {data: infoData, refetch: refetchInfo, startPolling, stopPolling} = useQuery(GET_ARCHIVE_INFO, {
        fetchPolicy: 'network-only'
    });

    const serverGenerating = infoData && infoData.provisioningGeneratorIsGenerating === true;
    const archiveInfo = infoData && infoData.provisioningGeneratorArchiveInfo;
    const sites = sitesOf(infoData);

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

    // SC 2.4.3: the Generate button is replaced by a progress indicator while generating, and Delete by one while
    // deleting. Keep focus on the matching section heading meanwhile, then return it to the Generate button.
    // Moonstone Button does not forward refs, hence the lookup inside the actions container.
    useFocusDuringWork(generating, generateHeadingRef, () => actionsRef.current?.querySelector('button'));
    useFocusDuringWork(deleting, archiveHeadingRef, () => archiveHeadingRef.current);

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
                await generate({variables: {async: true, siteKeys, includeSystemModules}});
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
            setGenerateStatus('deleted');
        } catch (_err) {
            setGenerateStatus('error');
        }
    };

    return (
        <div className={styles.pg_container}>
            {/* SC 4.1.3: two fixed-role live regions always in DOM — AT registers roles at mount.
                Polite region: success, proxy-timeout warning and loading states. Assertive region: errors only.
                The visible banners stay in the reading order so the last result can be found again in browse mode. */}
            <div role="status" aria-live="polite" aria-atomic="true" className={styles.pg_sr_only}>
                {politeMessage(generateStatus, {archiveInfo, generating, deleting}, t)}
            </div>
            <div role="alert" aria-live="assertive" aria-atomic="true" className={styles.pg_sr_only}>
                {generateStatus === 'error' ? t('label.error') : ''}
            </div>

            <header className={styles.pg_header}>
                {/* CRIT-02: component starts at h2; Jahia admin shell is expected to provide an h1 landmark */}
                <Typography variant="title" component="h2" className={styles.pg_title}>{t('label.title')}</Typography>
                <Typography variant="body" className={styles.pg_lead}>{t('label.description')}</Typography>
            </header>

            <section className={styles.pg_section} aria-labelledby="pg-generate-heading">
                <Typography
                    ref={generateHeadingRef}
                    id="pg-generate-heading"
                    variant="heading"
                    component="h3"
                    tabIndex={-1}
                    className={styles.pg_section_title}
                >
                    {t('label.generateHeading')}
                </Typography>

                <ScopeSelector sites={sites} state={scopeState} isDisabled={isLoading}/>

                <div ref={actionsRef} className={styles.pg_actions}>
                    {generating ? (
                        <Progress label={t('label.generating')}/>
                    ) : (
                        <Button
                            type="button"
                            size="big"
                            color="accent"
                            icon={<Archive/>}
                            label={t('label.generate')}
                            isDisabled={isLoading || noSiteSelected}
                            aria-describedby={hintId}
                            onClick={handleGenerate}
                        />
                    )}
                    <SelectSiteHint id={hintId} isHidden={isLoading}/>
                </div>

                <StatusBanner status={generateStatus}/>
            </section>

            <ArchivePanel
                archiveInfo={archiveInfo}
                isBusy={isLoading}
                isDeleting={deleting}
                headingRef={archiveHeadingRef}
                onDelete={handleDelete}
            />
        </div>
    );
};

export default ProvisioningGeneratorAdmin;

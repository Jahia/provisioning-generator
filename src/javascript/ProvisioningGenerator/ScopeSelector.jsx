import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Typography} from '@jahia/moonstone';
import styles from './ProvisioningGenerator.scss';

const SELECT_SITE_HINT_ID = 'pg-select-site';

/**
 * Export scope state: all active modules or the modules used by a set of sites, and whether platform modules
 * (Jahia-Module-Type: system) are included. siteKeys is the value sent to the mutation (null means all modules).
 */
export const useSiteScope = () => {
    const [scope, setScope] = useState('all');
    const [selectedSites, setSelectedSites] = useState([]);
    const [includeSystemModules, setIncludeSystemModules] = useState(false);
    const toggleSite = (siteKey, checked) => {
        setSelectedSites(current => (checked ?
            [...current.filter(key => key !== siteKey), siteKey] :
            current.filter(key => key !== siteKey)));
    };

    const noSiteSelected = scope === 'sites' && selectedSites.length === 0;
    return {
        scope,
        setScope,
        selectedSites,
        toggleSite,
        includeSystemModules,
        setIncludeSystemModules,
        noSiteSelected,
        hintId: noSiteSelected ? SELECT_SITE_HINT_ID : undefined,
        siteKeys: scope === 'sites' ? selectedSites : null
    };
};

/*
 * Native inputs and role="group" containers on purpose: in the Jahia admin, the legacy GWT theme
 * (jahia-anthracite) forces padding/borders on every <fieldset> with !important, and the Moonstone
 * RadioItem icons of the shell render at 0x0. Native controls are tinted with the accent color.
 */
const Option = ({id, type, name, value, checked, isDisabled, label, description, onChange}) => {
    const descriptionId = description ? `${id}-description` : undefined;
    return (
        <div className={styles.pg_option}>
            <input
                id={id}
                type={type}
                name={name}
                value={value}
                checked={checked}
                disabled={isDisabled}
                aria-describedby={descriptionId}
                className={styles.pg_option_input}
                onChange={e => onChange(e.target.value, e.target.checked)}
            />
            <div className={styles.pg_option_text}>
                <label htmlFor={id} className={styles.pg_option_label}>{label}</label>
                {description && (
                    <Typography id={descriptionId} variant="caption" className={styles.pg_option_description}>
                        {description}
                    </Typography>
                )}
            </div>
        </div>
    );
};

const SiteList = ({sites, selectedSites, hintId, isDisabled, onToggleSite}) => {
    const {t} = useTranslation('provisioning-generator');
    return (
        /* SC 3.3.2: the "select a site" hint is read when focus enters the group,
           since the disabled Generate button it explains is not focusable */
        <div role="group" aria-label={t('label.sites')} aria-describedby={hintId} className={styles.pg_sites}>
            {sites.map(site => (
                <Option
                    key={site.siteKey}
                    id={`pg-site-${site.siteKey}`}
                    type="checkbox"
                    value={site.siteKey}
                    checked={selectedSites.includes(site.siteKey)}
                    isDisabled={isDisabled}
                    label={site.title}
                    description={site.title === site.siteKey ? undefined : site.siteKey}
                    onChange={onToggleSite}
                />
            ))}
        </div>
    );
};

export const ScopeSelector = ({sites, state, isDisabled}) => {
    const {t} = useTranslation('provisioning-generator');
    const {scope, setScope, selectedSites, toggleSite, includeSystemModules, setIncludeSystemModules, hintId} = state;
    const hasSites = sites.length > 0;

    return (
        <div role="group" aria-labelledby="pg-scope-label" className={styles.pg_scope}>
            <Typography id="pg-scope-label" variant="subheading" weight="bold">{t('label.scope')}</Typography>
            <div role="radiogroup" aria-labelledby="pg-scope-label" className={styles.pg_options}>
                <Option
                    id="pg-scope-all"
                    type="radio"
                    name="pg-scope"
                    value="all"
                    checked={scope === 'all'}
                    isDisabled={isDisabled}
                    label={t('label.scopeAll')}
                    description={t('label.scopeAllDescription')}
                    onChange={setScope}
                />
                <Option
                    id="pg-scope-sites"
                    type="radio"
                    name="pg-scope"
                    value="sites"
                    checked={scope === 'sites'}
                    isDisabled={isDisabled || !hasSites}
                    label={t('label.scopeSites')}
                    description={hasSites ? t('label.scopeSitesDescription') : t('label.noSites')}
                    onChange={setScope}
                />
            </div>
            {scope === 'sites' && hasSites && (
                <SiteList
                    sites={sites}
                    selectedSites={selectedSites}
                    hintId={hintId}
                    isDisabled={isDisabled}
                    onToggleSite={toggleSite}
                />
            )}
            <div className={styles.pg_option_separated}>
                <Option
                    id="pg-include-system"
                    type="checkbox"
                    value="includeSystemModules"
                    checked={includeSystemModules}
                    isDisabled={isDisabled}
                    label={t('label.includeSystemModules')}
                    description={t('label.includeSystemModulesDescription')}
                    onChange={(value, checked) => setIncludeSystemModules(checked)}
                />
            </div>
        </div>
    );
};

// Explains why the Generate button is disabled (referenced through aria-describedby).
// SC 4.1.3: the polite wrapper stays mounted so the hint is announced when it appears.
export const SelectSiteHint = ({id, isHidden}) => {
    const {t} = useTranslation('provisioning-generator');
    return (
        <div aria-live="polite" aria-atomic="true">
            {id && !isHidden && (
                <Typography id={id} variant="caption" className={styles.pg_hint}>{t('label.selectSite')}</Typography>
            )}
        </div>
    );
};

export default ScopeSelector;

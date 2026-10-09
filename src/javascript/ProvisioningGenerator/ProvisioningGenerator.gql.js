import {gql} from '@apollo/client';

export const GET_ARCHIVE_INFO = gql`
    query ProvisioningGeneratorArchiveInfo {
        provisioningGeneratorIsGenerating
        provisioningGeneratorArchiveInfo {
            createdAt
            siteKeys
        }
        provisioningGeneratorSites {
            siteKey
            title
        }
    }
`;

export const GENERATE_PROVISIONING_ARCHIVE = gql`
    mutation GenerateProvisioningArchive($async: Boolean, $siteKeys: [String]) {
        provisioningGeneratorGenerate(async: $async, siteKeys: $siteKeys)
    }
`;

export const DELETE_PROVISIONING_ARCHIVE = gql`
    mutation DeleteProvisioningArchive {
        provisioningGeneratorDelete
    }
`;

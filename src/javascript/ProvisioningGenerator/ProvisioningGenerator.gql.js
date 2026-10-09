import {gql} from '@apollo/client';

export const GET_ARCHIVE_INFO = gql`
    query ProvisioningGeneratorArchiveInfo {
        provisioningGeneratorIsGenerating
        provisioningGeneratorArchiveInfo {
            createdAt
        }
    }
`;

export const GENERATE_PROVISIONING_ARCHIVE = gql`
    mutation GenerateProvisioningArchive($async: Boolean) {
        provisioningGeneratorGenerate(async: $async)
    }
`;

export const DELETE_PROVISIONING_ARCHIVE = gql`
    mutation DeleteProvisioningArchive {
        provisioningGeneratorDelete
    }
`;

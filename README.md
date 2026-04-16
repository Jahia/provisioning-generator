
# Provisioning generator

The purpose of this module is to create an archive with all the active modules of a platform and the related YAML provisioning file.
Afterward, this archive can be used to install these modules on another platform or in the same one if needed.

## Installation

- In Jahia, go to "Administration → Server settings → System components → Modules"
- Upload the JAR **provisioning-generator-X.X.X.jar**
- Check that the module is started

## How to use

### Administration UI

Once installed, the module adds a **Provisioning Generator** entry under **Server Administration → System Components**.

From this page you can:

- **Generate** a new provisioning archive. A loading animation is displayed while the archive is being built. Navigating away and coming back to the page will still show the loading state until generation completes.
- **Download** the generated archive (`provisioning-export.zip`) once it is ready.
- **Delete** the archive from the server.
- See the **date and time** the archive was last generated.

### With Karaf commands

#### <a name="provisioning-generator:generate"></a>provisioning-generator:generate

Generates an archive in the folder `JAHIA_HOME/digital-factory-data/content/tmp/`.

**Example:**

    provisioning-generator:generate

### With the provisioning API

    POST /modules/api/provisioning
    Content-Type: application/yaml

    - karafCommand: "provisioning-generator:generate"

## Archive contents

The generated ZIP file contains:

- One JAR file per active module, as stored in the Jahia module management repository.
- A `provisionning.yaml` file listing all bundles with `autoStart: true`, ready to be replayed via the Jahia provisioning API.

The archive is also stored in JCR at `/sites/systemsite/files/provisioning-generator/provisioning-export.zip` and is accessible through the administration UI.

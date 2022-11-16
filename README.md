
# Provisioning generator

The purpose of this module is to create an archive with all the active modules of a platform and the related YAML provisioning file.
Afterward, this archive can be used to install these modules on another platform or in the same one if needed.

## Installation

- In Jahia, go to "Administration --> Server settings --> System components --> Modules"
- Upload the JAR **provisioning-generator-X.X.X.jar**
- Check that the module is started

## How to use

### With Karaf commands
#### <a name="provisioning-generator:generate"></a>provisioning-generator:generate
Generate an archive in the folder JAHIA_HOME/digital-factory-data/content/tmp/

**Options:**

Name | alias | Mandatory | Value | Description
 --- | --- | :---: | :---: | ---


**Example:**

    provisioning-generator:generate


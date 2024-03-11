import { GoogleAuth } from "google-auth-library";
import { DOMParser } from '@xmldom/xmldom';
import { select, select1 } from 'xpath';
import { readFileSync } from 'fs';
import { homedir } from 'os';

let configData = null;
let configXmlDoc = null;
let configCorePropertyMap = null;
let configCustomPropertyMap = null;
let configClassificationOptionMap = null;
let configClassificationGroupOptionMap = null;
let configDatabaseConnectionUrl = null;
let configDatabaseName = null;


export const initializeConfigurations = (projectName) => {
    if (projectName) {
        configData = readFileSync(homedir() + '/bohm/config/add-on-config-' + projectName + '.xml', 'utf8');
    } else {
        configData = readFileSync(homedir() + '/bohm/config/add-on-config.xml', 'utf8');
    }

    configXmlDoc = new DOMParser().parseFromString(configData, 'text/xml');

    configCorePropertyMap = select("/configuration/property-groups/core", configXmlDoc).map(corePtyGpNode => {
        return {
            key: select1("@name", corePtyGpNode).value,
            value: select("property", corePtyGpNode).map(corePtyNode => {
                return select1("@name", corePtyNode).value;
            })
        };
    }).reduce((acc, cur) => {
        acc.set(cur.key, cur.value);
        return acc;
    }, new Map());

    configCustomPropertyMap = select("/configuration/property-groups/custom", configXmlDoc).map(customPtyGpNode => {
        return {
            key: select1("@name", customPtyGpNode).value,
            value: select("property", customPtyGpNode).map(customPtyNode => {
                return select1("@name", customPtyNode).value;
            })
        };
    }).reduce((acc, cur) => {
        acc.set(cur.key, cur.value);
        return acc;
    }, new Map());

    configClassificationOptionMap = select("/configuration/classification-options/classification", configXmlDoc).map(optionNode => {
        return {
            key: select1("@code", optionNode).value,
            value: select1("@name", optionNode).value
        };
    }).reduce((acc, cur) => {
        acc.set(cur.key, cur.value);
        return acc;
    }, new Map());

    configClassificationGroupOptionMap = select("/configuration/classification-group-options/classification", configXmlDoc).map(optionNode => {
        return {
            key: select1("@code", optionNode).value,
            value: select1("@name", optionNode).value
        };
    }).reduce((acc, cur) => {
        acc.set(cur.key, cur.value);
        return acc;
    }, new Map());

    configDatabaseConnectionUrl = select1("/configuration/database-connection/@url", configXmlDoc).value;
    configDatabaseName = select1("/configuration/database-connection/@name", configXmlDoc).value;
}

export const getConfigurationCorePropertyMap = () => {
    return configCorePropertyMap;
}

export const getConfigurationCustomPropertyMap = () => {
    return configCustomPropertyMap;
}

export const getConfigurationClassificationOptionMap = () => {
    return configClassificationOptionMap;
}

export const getConfigurationClassificationGroupOptionMap = () => {
    return configClassificationGroupOptionMap;
}

export const getDatabaseConnectionUrl = () => {
    return configDatabaseConnectionUrl;
}

export const getDatabaseName = () => {
    return configDatabaseName;
}

export const googleAuth = new GoogleAuth({
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"],
});
import { DOMParser } from '@xmldom/xmldom'
import { select, select1 } from 'xpath';
import { readFileSync } from 'fs';
import { homedir } from 'os';

export let configCorePtyMap = {};

const configData = readFileSync(homedir() + '/bohm/add-on-config.xml', 'utf8');
const configXmlDoc = new DOMParser().parseFromString(configData, 'text/xml');

for (const corePtyNode of select("/configuration/property-groups/core", configXmlDoc)) {
    configCorePtyMap[select1("@name", corePtyNode).value] = [];

    for (const ptyNode of select("property", corePtyNode)) {
        configCorePtyMap[select1("@name", corePtyNode).value].push(select1("@name", ptyNode).value);
    }
}

export let configCustomPtyMap = {};

for (const customPtyNode of select("/configuration/property-groups/custom", configXmlDoc)) {
    configCustomPtyMap[select1("@name", customPtyNode).value] = [];

    for (const ptyNode of select("property", customPtyNode)) {
        configCustomPtyMap[select1("@name", customPtyNode).value].push(select1("@name", ptyNode).value);
    }
}

export let configClassGpCustomPtyGpMap = {};

for (const mappingNode of select("/configuration/classification-group-custom-property-group-mapping/mapping", configXmlDoc)) {
    configClassGpCustomPtyGpMap[select1("@classification-group", mappingNode).value] =
        select1("@property-group", mappingNode).value;
}

export const getSheet = async function (service, googlesheetId, sheetName, hasHeader = false) {
    const result = await service.values.get({
        "spreadsheetId": googlesheetId,
        "range": `'${sheetName}'`,
    });

    if (result.data == null || result.data.values == null) {
        return { name: sheetName, headers: [], values: [] };
    }

    if (hasHeader) {
        return { name: sheetName, headers: result.data.values[0], values: result.data.values.slice(1) };
    } else {
        return { name: sheetName, headers: [], values: result.data.values };
    }
};


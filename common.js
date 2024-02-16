import { DOMParser } from '@xmldom/xmldom'
import { select, select1 } from 'xpath';
import { readFileSync } from 'fs';
import { homedir } from 'os';

export let configCorePtyMap = {};






const configData = readFileSync(homedir() + '/bohm/config/add-on-config.xml', 'utf8');
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

export const getFullSheet = async function (service, googlesheetId, hasHeader = false) {

    let sheets = {};

    const result = await service.get({
        "spreadsheetId": googlesheetId,
        "includeGridData": true,
    });

    if (result.data != null) {
        await result.data.sheets.forEach(sheet => {
            sheets[sheet.properties.title] = { name: sheet.properties.title, id: sheet.properties.sheetId, headers: [], values: [] };

            if (hasHeader) {
                sheets[sheet.properties.title].headers = sheet.data.values[0];
                sheets[sheet.properties.title].values = sheet.data.values.slice(1);
            } else {
                sheets[sheet.properties.title].values = sheet.data.values;
            }

        });
    }

    return sheets;
};

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


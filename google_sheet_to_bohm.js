import { homedir } from 'os';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { create } from 'xmlbuilder2';
import { readFileSync, writeFileSync } from 'fs';
// import { sheets } from 'googleapis/build/src/apis/sheets/index.js';
import os from 'os';

import { DOMParser } from '@xmldom/xmldom'
import { select, select1 } from 'xpath';

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/service-account-token.json`;

const configData = readFileSync(homedir() + '/bohm/add-on-config.xml', 'utf8');
const configXmlDoc = new DOMParser().parseFromString(configData, 'text/xml');

let configCorePtyGroupList = [];

for (const corePtyNode of select("/configuration/property-groups/core", configXmlDoc)) {
    configCorePtyGroupList.push(select1("@name", corePtyNode).value);
}

let configCustomPtyGroupList = [];

for (const customPtyNode of select("/configuration/property-groups/custom", configXmlDoc)) {
    configCustomPtyGroupList.push(select1("@name", customPtyNode).value);
}

let configClassGpPtyMap = {};

for (const mappingNode of select("/configuration/classification-group-custom-property-group-mapping/mapping", configXmlDoc)) {
    configClassGpPtyMap[select1("@classification-group", mappingNode).value] =
        select1("@property-group", mappingNode).value;
}

async function getElementPropertiesEntries(service, googlesheetId, sheetName) {
    const result = await service.values.get({
        "spreadsheetId": googlesheetId,
        "range": `'${sheetName}'`,
    });

    if (result.data == null || result.data.values == null) { return []; }

    return { name: sheetName, headers: result.data.values[0], values: result.data.values.slice(1) };
}

async function getProjectMap(service, googlesheetId) {
    let projectMap = new Map();

    const result = await service.values.get({
        "spreadsheetId": googlesheetId,
        "range": "'Project Information'",
    });

    if (result.data == null || result.data.values == null) { return projectMap; }

    for (const [name, value] of result.data.values) {
        if (name != null && name.trim() != '' &&
            value != null && value.trim() != '' &&
            !projectMap.has(name)) {
            projectMap.set(name, value);
        }
    }

    return projectMap;
}

async function parseImportData(sheetData) {

    let scheduleObj = {};

    // not enough data to process.
    if (sheetData.length < 3) { return scheduleObj; }

    const projectMap = sheetData[0];
    const generalDatasheet = sheetData[1];
    let elementCorePropertiesEntries = {};
    let elementCustomPropertyEntries = {};

    let sheetIdx = 2;

    for (const corePtyGroupName of configCorePtyGroupList) {
        elementCorePropertiesEntries[corePtyGroupName] = sheetData[sheetIdx++];
    }

    for (const customPtyGroupName of configCustomPtyGroupList) {
        elementCustomPropertyEntries[customPtyGroupName] = sheetData[sheetIdx++];
    }

    scheduleObj.project_name = projectMap.get('Project Name');
    scheduleObj.elements = [];

    // loop through all elements in the sheet.
    for (let generalDatasheetRow of generalDatasheet.values) {
        let element = {
            guid: generalDatasheetRow[0],
            name: generalDatasheetRow[1],
            classification: generalDatasheetRow[2].split(' ')[0],
            classificationGroup: generalDatasheetRow[3].split(' ')[0],
            corePropertyGroups: {},
            customPropertyGroups: {}
        };

        // parse core properties.
        for (let core_property_group_key of Object.keys(elementCorePropertiesEntries)) {
            element.corePropertyGroups[core_property_group_key] = [];
            let datasheetRowIndex = -1;

            // find the matching row in the sheet.
            for (let j = 0; j < elementCorePropertiesEntries[core_property_group_key].values.length; j++) {
                if (elementCorePropertiesEntries[core_property_group_key].values[j][0] == element.guid) {
                    datasheetRowIndex = j;
                    break;
                }
            }

            // extract the data from the row.
            if (datasheetRowIndex > -1) {
                let row = elementCorePropertiesEntries[core_property_group_key].values[datasheetRowIndex];

                for (let j = 1; j < row.length; j++) {
                    if (row[j] != null && row[j].trim() != '') {
                        element.corePropertyGroups[core_property_group_key].push({
                            name: elementCorePropertiesEntries[core_property_group_key].headers[j],
                            value: row[j].trim()
                        });
                    }
                }
            }
        }
        // parse core properties.

        // parse custom properties.
        const requiredCustomPtyGroupName = configClassGpPtyMap[element.classificationGroup];

        for (let custom_property_group_key of Object.keys(elementCustomPropertyEntries)) {
            if (requiredCustomPtyGroupName != custom_property_group_key) { continue; }
            element.customPropertyGroups[custom_property_group_key] = [];
            let datasheetRowIndex = -1;

            // find the matching row in the sheet.
            for (let j = 0; j < elementCustomPropertyEntries[custom_property_group_key].values.length; j++) {
                if (elementCustomPropertyEntries[custom_property_group_key].values[j][0] == element.guid) {
                    datasheetRowIndex = j;
                    break;
                }
            }

            // extract the data from the row.
            if (datasheetRowIndex > -1) {

                let row = elementCustomPropertyEntries[custom_property_group_key].values[datasheetRowIndex];
                for (let j = 1; j < row.length; j++) {
                    if (row[j] != null && row[j].trim() != '') {
                        element.customPropertyGroups[custom_property_group_key].push({
                            name: elementCustomPropertyEntries[custom_property_group_key].headers[j],
                            value: row[j].trim()
                        });
                    }
                }
            }
        }
        // parse custom properties.

        scheduleObj.elements.push(element);
    }

    return scheduleObj;
}

async function constructImportDataXml(scheduleObj) {

    let xmlObj = {
        project: {
            "@name": scheduleObj.project_name,
            elements: {
                element: []
            }
        }
    };

    for (const element of scheduleObj.elements) {
        let xmlElement = {
            "@guid": element.guid,
            "@name": element.name,
            classification: { "@code": element.classification },
            "classification-group": { "@code": element.classificationGroup },
            "property-groups": { core: [], custom: [] }
        };

        for (const corePtyGroupKey of Object.keys(element.corePropertyGroups)) {
            let propertyGroup = { "@name": corePtyGroupKey, property: [] };
            for (const corePty of element.corePropertyGroups[corePtyGroupKey]) {
                propertyGroup.property.push({ "@name": corePty.name, "@value": corePty.value });
            }

            xmlElement["property-groups"].core.push(propertyGroup);
        }

        for (const customPtyGroupKey of Object.keys(element.customPropertyGroups)) {
            let propertyGroup = { "@name": customPtyGroupKey, property: [] };
            for (const customPty of element.customPropertyGroups[customPtyGroupKey]) {
                propertyGroup.property.push({ "@name": customPty.name, "@value": customPty.value });
            }

            xmlElement["property-groups"].custom.push(propertyGroup);
        }

        xmlObj.project.elements.element.push(xmlElement);
    }

    const xmlDoc = create({ encoding: "UTF-8", standalone: false }, xmlObj);
    const xml = xmlDoc.end({ prettyPrint: true });

    try {
        writeFileSync(os.homedir() + '/bohm/add-on-import-data.xml', xml);
        console.log(os.homedir() + "/bohm/add-on-import-data.xml has been saved.");
    } catch (error) {
        console.error(error);
    }
}

async function main(googlesheetId) {
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const service = google.sheets({ version: 'v4', auth }).spreadsheets;

    let functionList = [];

    functionList.push(() => getProjectMap(service, googlesheetId));
    functionList.push(() => getElementPropertiesEntries(service, googlesheetId, 'Element Name & Classification'));

    for (const corePtyNode of select("/configuration/property-groups/core", configXmlDoc)) {
        functionList.push(() => getElementPropertiesEntries(service, googlesheetId, select1("@name", corePtyNode).value));
    }

    for (const customPtyNode of select("/configuration/property-groups/custom", configXmlDoc)) {
        functionList.push(() => getElementPropertiesEntries(service, googlesheetId, select1("@name", customPtyNode).value));
    }

    const result = await Promise.all(functionList.map(func => func()));
    let importData = await parseImportData(result);

    await constructImportDataXml(importData);
}

const args = process.argv.slice(2);

main(args[0]).catch(console.error);

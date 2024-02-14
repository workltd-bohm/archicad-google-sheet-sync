import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { select, select1 } from "xpath";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { getSpreadSheetProperty, getSheetData, createSpreadSheet, formatHeaderRequests, protectedRangeRequest, dataValidationRequest } from "./google_sheet_api.js";
import { configurationCorePropertyMap, configurationCustomPropertyMap, classificationOptionMap, classificationGroupOptionMap } from "./config.js";
import dayjs from 'dayjs';

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/service-account-token.json`;

const parseSyncXmlData = async function (syncXmlDoc) {
    let project = {
        name: null,
        elements: [],
        deletedElements: []
    };

    project.name = select1("/project/@name", syncXmlDoc).value;

    select("/project/elements/element", syncXmlDoc).forEach(xmlElement => {
        let element = {
            guid: select1("@guid", xmlElement).value,
            name: select1("@name", xmlElement).value,
            type: select1("@type", xmlElement).value,
            variation: select1("@variation", xmlElement).value,
            modiStamp: select1("@modiStamp", xmlElement).value,
            classification: {
                code: select1("@code", select1("classification", xmlElement)).value,
                name: select1("@name", select1("classification", xmlElement)).value
            },
            classificationGroup: {
                code: select1("@code", select1("classification-group", xmlElement)).value,
                name: select1("@name", select1("classification-group", xmlElement)).value
            },
            libraryPart: {
                index: select1("@index", select1("library-part", xmlElement)).value,
                documentName: select1("@documentName", select1("library-part", xmlElement)).value,
                uniqueId: select1("@uniqueId", select1("library-part", xmlElement)).value
            },
            coreProperties: new Map(),
            customProperties: new Map()
        };

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            element.coreProperties.set(corePtyGpName, new Map());
            corePtyMap.forEach(corePtyName => {
                const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName}"]/property[@name="${corePtyName}"]/@value`, xmlElement);
                element.coreProperties.get(corePtyGpName).set(corePtyName, corePtyNode == null ? null : corePtyNode.value);
            });
        });


        // Object.keys(configurationCorePropertyMap).forEach(corePtyGpName => {
        //     element.coreProperties[corePtyGpName] = {};

        //     configurationCorePropertyMap[corePtyGpName].forEach(corePtyName => {
        //         const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName}"]/property[@name="${corePtyName}"]/@value`, xmlElement);
        //         element.coreProperties[corePtyGpName][corePtyName] = corePtyNode == null ? null : corePtyNode.value;
        //     });
        // });

        if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
            const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;
            element.customProperties.set(customPropertyGroupName, new Map());

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    const customPtyNode = select1(`custom-property-groups/group[@name="${customPropertyGroupName}"]/property[@name="${customPtyName}"]/@value`, xmlElement);
                    element.customProperties.get(customPropertyGroupName).set(customPtyName, customPtyNode == null ? null : customPtyNode.value);
                });
            }

            // if (Object.keys(configurationCustomPropertyMap).includes(customPropertyGroupName)) {
            //     configurationCustomPropertyMap[customPropertyGroupName].forEach(customPtyName => {
            //         const customPtyNode = select1(`custom-property-groups/group[@name="${customPropertyGroupName}"]/property[@name="${customPtyName}"]/@value`, xmlElement);
            //         element.customProperties[customPropertyGroupName][customPtyName] = customPtyNode == null ? null : customPtyNode.value;
            //     });
            // }
        }

        project.elements.push(element);
    });

    select("/project/deleted-elements/element", syncXmlDoc).forEach(xmlElement => {
        project.deletedElements.push(select1("@guid", xmlElement).value);
    });

    return project;
}

async function getAllSheetData(sheet_service, spreadSheetMetaData) {
    const projectSheet = await getSheetData(sheet_service, spreadSheetMetaData, "Project Information", false);
    const generalSheet = await getSheetData(sheet_service, spreadSheetMetaData, "Element Name & Classification", true);

    let corePropertySheets = new Map();
    let customPropertySheets = new Map();


    for (const corePtyGpName of configurationCorePropertyMap.keys()) {
        corePropertySheets.set(corePtyGpName, await getSheetData(sheet_service, spreadSheetMetaData, corePtyGpName, true));
    }

    for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
        customPropertySheets.set(customPtyGpName, await getSheetData(sheet_service, spreadSheetMetaData, customPtyGpName, true));
    }

    return [projectSheet, generalSheet, corePropertySheets, customPropertySheets];
}

const composeGeneralSheetRow = async function (element) {
    let row = [
        element.guid,
        element.name,
        `${element.classification.code} ${element.classification.name}`,
        `${element.classificationGroup.code} ${element.classificationGroup.name}`,
        element.type,
        element.variation,
        element.libraryPart.documentName,
        element.libraryPart.index,
        element.libraryPart.uniqueId,
        element.modiStamp
    ];

    return row;
}

const composeCorePropertySheetRow = async function (element, generalSheetRowIndex, configPropertyMap, elementProperties) {
    let row = [
        element.guid,
        `='Element Name & Classification'!B${generalSheetRowIndex + 2}`,
        `='Element Name & Classification'!C${generalSheetRowIndex + 2}`,
        ...configPropertyMap.map(propertyName => {
            return elementProperties.get(propertyName);
        })
    ];

    return row;
}

const composeCustomPropertySheetRow = async function (element, configPropertyMap, elementProperties) {
    let row = [
        element.guid,
        ...configPropertyMap.map(propertyName => {
            return elementProperties.get(propertyName);
        })
    ];

    return row;
}

const updateSheetsData = async function (sheet_service, spreadSheetMetaData, syncData) {
    const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await getAllSheetData(sheet_service, spreadSheetMetaData);

    let changeSet = [];
    let extendRowSet = new Map();


    changeSet.push({
        range: `'${projectSheet.name}'!A1`,
        values: [["Project Name", syncData.name]],
    });

    // Compare the data and update the Google Sheet.
    for (const element of syncData.elements) {
        // Handle the "Element & Classification" sheet.
        const generalSheetRowData = await composeGeneralSheetRow(element);
        let generalSheetRowIndex = generalSheet.values.findIndex(row => row[0] == element.guid);

        if (generalSheetRowIndex == -1) {
            // Add the element to the "Element & Classification" sheet.
            extendRowSet.set(generalSheet.name, extendRowSet.get(generalSheet.name) == null ? 1 : extendRowSet.get(generalSheet.name) + 1);
            generalSheetRowIndex = generalSheet.values.length;
        }

        changeSet.push({
            range: `'${generalSheet.name}'!A${generalSheetRowIndex + 2}`,
            values: [generalSheetRowData],
        });

        generalSheet.values.push(generalSheetRowData);
        // Handle the "Element & Classification" sheet.

        // Handle the core property sheets.
        for (const corePtyGpName of configurationCorePropertyMap.keys()) {
            const corePropertySheet = corePropertySheets.get(corePtyGpName);
            let corePropertySheetRowData = await composeCorePropertySheetRow(element, generalSheetRowIndex, configurationCorePropertyMap.get(corePtyGpName), element.coreProperties.get(corePtyGpName));
            let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == element.guid);

            if (corePropertySheetRowIndex == -1) {
                extendRowSet.set(corePtyGpName, extendRowSet.get(corePtyGpName) == null ? 1 : extendRowSet.get(corePtyGpName) + 1);
                corePropertySheetRowIndex = corePropertySheet.values.length;
            }

            changeSet.push({
                range: `'${corePropertySheet.name}'!A${corePropertySheetRowIndex + 2}`,
                values: [corePropertySheetRowData],
            });

            corePropertySheet.values.push(corePropertySheetRowData);
        }
        // Handle the core property sheets.

        // Handle the custom property sheet.
        if (element.customProperties.size > 0) {
            for (const customPtyGpName of element.customProperties.keys()) {
                const customPropertySheet = customPropertySheets.get(customPtyGpName);
                let customPropertySheetRowData = await composeCustomPropertySheetRow(element, configurationCustomPropertyMap.get(customPtyGpName), element.customProperties.get(customPtyGpName));
                let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == element.guid);

                if (customPropertySheetRowIndex == -1) {
                    extendRowSet.set(customPtyGpName, extendRowSet.get(customPtyGpName) == null ? 1 : extendRowSet.get(customPtyGpName) + 1);
                    customPropertySheetRowIndex = customPropertySheet.values.length;
                }

                changeSet.push({
                    range: `'${customPropertySheet.name}'!A${customPropertySheetRowIndex + 2}`,
                    values: [customPropertySheetRowData],
                });

                customPropertySheet.values.push(customPropertySheetRowData);
            }
        }
        // Handle the custom property sheet.
    }

    // Extend the rows of the sheets before adding new data.
    if (extendRowSet.size > 0) {
        const response = await sheet_service.batchUpdate({
            spreadsheetId: spreadSheetMetaData.id,
            resource: {
                requests: Array.from(extendRowSet.entries()).map(([sheetName, extendRowCount]) => {
                    return {
                        appendDimension: {
                            sheetId: spreadSheetMetaData.sheets.find(sheet => sheet.name === sheetName)?.id,
                            dimension: "ROWS",
                            length: extendRowCount
                        }
                    };
                })
            }
        });
    };
    // Extend the rows of the sheets before adding new data.

    // Update and add new data to the sheets.
    const response = await sheet_service.values.batchUpdate({
        spreadsheetId: spreadSheetMetaData.id,
        resource: {
            data: changeSet,
            valueInputOption: "USER_ENTERED"
        }
    });
    // Update and add new data to the sheets.

    // Remove the deleted elements from the sheets.
    if (syncData.deletedElements.length > 0) {
        let deleteRowSet = new Map();

        syncData.deletedElements.forEach(guid => {
            let generalSheetRowIndex = generalSheet.values.findIndex(row => row[0] == guid);

            if (generalSheetRowIndex > -1) {
                deleteRowSet.set(generalSheet.name, generalSheetRowIndex + 1);
            }

            for (const corePtyGpName of configurationCorePropertyMap.keys()) {
                const corePropertySheet = corePropertySheets.get(corePtyGpName);
                let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == guid);

                if (corePropertySheetRowIndex > -1) {
                    deleteRowSet.set(corePropertySheet.name, corePropertySheetRowIndex + 1);
                }
            }

            for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
                const customPropertySheet = customPropertySheets.get(customPtyGpName);
                let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == guid);

                if (customPropertySheetRowIndex > -1) {
                    deleteRowSet.set(customPropertySheet.name, customPropertySheetRowIndex + 1);
                }
            }
        });

        if (deleteRowSet.size > 0) {
            const response = await sheet_service.batchUpdate({
                spreadsheetId: spreadSheetMetaData.id,
                resource: {
                    requests: Array.from(deleteRowSet.entries()).map(([sheetName, deleteRowIndex]) => {
                        return {
                            deleteDimension: {
                                range: {
                                    sheetId: spreadSheetMetaData.sheets.find(sheet => sheet.name === sheetName)?.id,
                                    dimension: "ROWS",
                                    startIndex: deleteRowIndex,
                                    endIndex: deleteRowIndex + 1
                                }
                            }
                        };
                    })
                }
            });
        };
    }


    // Remove the deleted elements from the sheets.
}

const createMasterSpreadsheet = async function (driveService, sheetService, projectName) {
    const sheetNames = ["Project Information",
        "Element Name & Classification",
        ...Array.from(configurationCorePropertyMap.keys()),
        ...Array.from(configurationCustomPropertyMap.keys()),
        "[Reserved] Classification List",
        "[Reserved] Classification Group List"
    ];

    const spreadSheetMetaData = await createSpreadSheet(driveService, sheetService, `${projectName} - Master Data List [${dayjs().format('YYYY-MM-DD HH:mm:ss')}]`, sheetNames);

    // Populate base data.
    let changeSet = [];
    let formattingRequests = [];


    changeSet.push({
        range: "'Project Information'!A1",
        values: [["Project Name"]],
    });

    changeSet.push({
        range: "'Element Name & Classification'!A1",
        values: [["Element GUID", "Element Name", "Classification", "Classification Group", "Element Type", "Type Variation", "Library Part Name", "Library Part Index", "Library Part GUID", "MOD Stamp"]],
    });

    formattingRequests.push(...formatHeaderRequests(spreadSheetMetaData.sheets.find(sheet => sheet.name === "Element Name & Classification")?.id));
    formattingRequests.push(...dataValidationRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === "Element Name & Classification")?.id, classificationOptionMap.size, classificationGroupOptionMap.size));
    formattingRequests.push(protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === "Element Name & Classification")?.id, 1, 9, 10));

    for (const corePtyGpName of configurationCorePropertyMap.keys()) {
        changeSet.push({
            range: `'${corePtyGpName}'!A1`,
            values: [["Element GUID", "Element Name", "Classification", ...configurationCorePropertyMap.get(corePtyGpName)]],
        });

        formattingRequests.push(...formatHeaderRequests(spreadSheetMetaData.sheets.find(sheet => sheet.name === corePtyGpName)?.id));
        formattingRequests.push(protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === corePtyGpName)?.id, 1, 0, 3));
    }

    for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
        changeSet.push({
            range: `'${customPtyGpName}'!A1`,
            values: [["Element GUID", ...configurationCustomPropertyMap.get(customPtyGpName)]],
        });

        formattingRequests.push(...formatHeaderRequests(spreadSheetMetaData.sheets.find(sheet => sheet.name === customPtyGpName)?.id));
    }

    changeSet.push({
        range: "'[Reserved] Classification List'!A1",
        values: [...classificationOptionMap.entries()].map(([key, value]) => [`${key} ${value}`])

    });

    changeSet.push({
        range: "'[Reserved] Classification Group List'!A1",
        values: [...classificationGroupOptionMap.entries()].map(([key, value]) => [`${key} ${value}`])

    });

    const response = await sheetService.values.batchUpdate({
        spreadsheetId: spreadSheetMetaData.id,
        resource: {
            data: changeSet,
            valueInputOption: "USER_ENTERED"
        }
    });

    sheetService.batchUpdate({
        spreadsheetId: spreadSheetMetaData.id,
        resource: { requests: formattingRequests }
    });

    return spreadSheetMetaData;
}

async function main(spreadSheetId, dataFilePath) {
    if (!existsSync(homedir() + "/bohm/add-on-export-data.xml")) {
        console.error("Data file not found");
        return;
    }

    const syncFile = readFileSync(homedir() + "/bohm/add-on-export-data.xml", "utf8");
    const syncXmlDoc = new DOMParser().parseFromString(syncFile, "text/xml");

    const syncData = await parseSyncXmlData(syncXmlDoc);

    const auth = new GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"],
    });

    const sheetService = google.sheets({ version: "v4", auth }).spreadsheets;
    const driveService = google.drive({ version: "v3", auth });
    let spreadSheetMetaData = null;
    // spreadSheetId = "1FGIp5upZ-OePUOvm-k-yTpkqCSnf-Rtsoz0fKoHWj5Y";

    if (spreadSheetId == null) {
        spreadSheetMetaData = await createMasterSpreadsheet(driveService, sheetService, syncData.name);
    } else {
        spreadSheetMetaData = await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);
    }

    await updateSheetsData(sheetService, spreadSheetMetaData, syncData);

    console.log(`Data sheet name: ${spreadSheetMetaData.name}`);
    console.log(`Data sheet ID: ${spreadSheetMetaData.id}`);
    console.log(`Data sheet URL: ${spreadSheetMetaData.url}`);
}

const args = process.argv.slice(2);

main(args[0]).catch(console.error);
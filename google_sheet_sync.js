import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { create } from 'xmlbuilder2';
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { parseSyncXmlData, composeSyncXmlData } from "./database_api.js";
import { getSpreadSheetProperty, getSheetData, createSpreadSheet, formatHeaderRequests, protectedRangeRequest, dataValidationRequest } from "./google_sheet_api.js";
import { configurationCorePropertyMap, configurationCustomPropertyMap, classificationOptionMap, classificationGroupOptionMap } from "./config.js";
import dayjs from 'dayjs';

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/config/service-account-token.json`;


async function getAllSheetData(sheetService, spreadSheetMetaData) {
    const projectSheet = await getSheetData(sheetService, spreadSheetMetaData, "Project Information", false);
    const generalSheet = await getSheetData(sheetService, spreadSheetMetaData, "Element Name & Classification", true);

    let corePropertySheets = new Map();
    let customPropertySheets = new Map();


    for (const corePtyGpName of configurationCorePropertyMap.keys()) {
        corePropertySheets.set(corePtyGpName, await getSheetData(sheetService, spreadSheetMetaData, corePtyGpName, true));
    }

    for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
        customPropertySheets.set(customPtyGpName, await getSheetData(sheetService, spreadSheetMetaData, customPtyGpName, true));
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

const parseSheetsData = function (projectSheet, generalSheet, corePropertySheets, customPropertySheets) {
    let project = {
        name: null,
        elements: [],
        deletedElements: []
    };

    project.name = projectSheet.values[0][1];

    for (const row of generalSheet.values) {
        let element = {
            guid: row[0]?.trim(),
            name: row[1]?.trim(),
            classification: {
                code: row[2]?.trim().split(' ')[0],
                name: row[2]?.trim().split(' ').slice(1).join(' ')
            },
            classificationGroup: {
                code: row[3]?.trim().split(' ')[0],
                name: row[3]?.trim().split(' ').slice(1).join(' ')
            },
            type: row[4]?.trim(),
            variation: row[5]?.trim(),
            libraryPart: {
                documentName: row[6]?.trim(),
                index: row[7]?.trim(),
                uniqueId: row[8]?.trim()
            },
            modiStamp: row[9]?.trim(),
            coreProperties: new Map(),
            customProperties: new Map()
        };

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            let corePtyRow = corePropertySheets.get(corePtyGpName).values.find(corePtyRow => corePtyRow[0] == row[0]);
            element.coreProperties.set(corePtyGpName, new Map());

            if (corePtyRow == null) {
                corePtyRow = [row[0], row[1], row[2], ...Array(configurationCustomPropertyMap.get(customPropertyGroupName).length).fill(null)];
            }

            corePtyMap.forEach(corePtyName => {
                const corePtyVal = corePtyRow[corePropertySheets.get(corePtyGpName).headers.indexOf(corePtyName)];
                if (corePtyVal?.trim()?.length > 0) {
                    element.coreProperties.get(corePtyGpName).set(corePtyName, corePtyVal?.trim());
                }

            });
        });

        if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
            const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                let customPtyRow = customPropertySheets.get(customPropertyGroupName).values.find(customPtyRow => customPtyRow[0] == row[0]);
                element.customProperties.set(customPropertyGroupName, new Map());

                if (customPtyRow == null) {
                    customPtyRow = [row[0], ...Array(configurationCustomPropertyMap.get(customPropertyGroupName).length).fill(null)];
                }

                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    const customPtyVal = customPtyRow[customPropertySheets.get(customPropertyGroupName).headers.indexOf(customPtyName)];
                    if (customPtyVal?.trim()?.length > 0) {
                        element.customProperties.get(customPropertyGroupName).set(customPtyName, customPtyVal?.trim());
                    }
                });
            }
        }

        project.elements.push(element);
    }

    return project;
}

const updateSheetsData = async function (sheetService, spreadSheetMetaData, syncData) {
    const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await getAllSheetData(sheetService, spreadSheetMetaData);

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
                if (!configurationCustomPropertyMap.has(customPtyGpName)) {
                    continue;
                }

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
        const response = await sheetService.batchUpdate({
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
    const response = await sheetService.values.batchUpdate({
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
            const response = await sheetService.batchUpdate({
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

const handleConsoleArguments = function (args) {
    let direction = null;
    let dataFileName = null;
    let spreadSheetId = null;

    if (args.length % 2 !== 0) {
        console.error('Invalid arguments');
        process.exit(1);
    }

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--direction":
                direction = args[++i]; // Increment i to get the next element
                break;
            case "--dataFile":
                dataFileName = args[++i];
                break;
            case "--spreadSheet":
                spreadSheetId = args[++i];
                break;
        }
    }

    if (!["push", "pull"].includes(direction)) {
        console.error('Invalid direction. Must be "push" or "pull".');
        process.exit(1);
    }

    if (dataFileName == null && direction === "push") {
        console.error('Data file name is required for "push" direction.');
        process.exit(1);
    }

    if (spreadSheetId == null && direction === "pull") {
        console.error('Spreadsheet ID is required for "pull" direction.');
        process.exit(1);
    }

    if (dataFileName == null && direction === "pull") {
        console.error('Data file name is required for "pull" direction.');
        process.exit(1);
    }

    return [direction, dataFileName, spreadSheetId];
}

async function main(args) {
    const [direction, dataFileName, spreadSheetId] = handleConsoleArguments(args);

    // Initialize the Google Drive API and Google Sheets API connection.
    const auth = new GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"],
    });

    const sheetService = google.sheets({ version: "v4", auth }).spreadsheets;
    const driveService = google.drive({ version: "v3", auth });
    // Initialize the Google Drive API and Google Sheets API connection.

    const dataFilePath = `${homedir()}/bohm/files/${dataFileName}`;

    if (direction === "push") {
        if (!existsSync(dataFilePath)) {
            console.error("Data file not found");
            return;
        }

        const syncFile = readFileSync(dataFilePath, "utf8");
        const syncXmlDoc = new DOMParser().parseFromString(syncFile, "text/xml");

        const syncData = await parseSyncXmlData(syncXmlDoc);

        const spreadSheetMetaData = spreadSheetId == null ?
            await createMasterSpreadsheet(driveService, sheetService, syncData.name) :
            await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);

        await updateSheetsData(sheetService, spreadSheetMetaData, syncData);

        console.log(`Data sheet name: ${spreadSheetMetaData.name}`);
        console.log(`Data sheet ID: ${spreadSheetMetaData.id}`);
        console.log(`Data sheet URL: ${spreadSheetMetaData.url}`);
    } else if (direction === "pull") {
        const spreadSheetMetaData = await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);
        const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await getAllSheetData(sheetService, spreadSheetMetaData);

        const syncData = parseSheetsData(projectSheet, generalSheet, corePropertySheets, customPropertySheets);

        const syncXmlDoc = composeSyncXmlData(syncData);

        try {
            // add-on-import-data.xml
            writeFileSync(dataFilePath, create({ encoding: "UTF-8", standalone: false }, syncXmlDoc).end({ prettyPrint: true }));

            console.log(`${dataFilePath} has been saved.`);
        } catch (error) {
            console.error(error);
        }
    }
}

main(process.argv.slice(2)).catch(console.error);
import { homedir } from "os";
import { parseDataSyncFile } from "./file_api.js";
import { DatabaseModel } from "./database_model.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { create } from 'xmlbuilder2';
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { composeSyncXmlData } from "./database_model.js";
import { getSpreadSheetProperty, getSheetData, createSpreadSheet, formatHeaderRequests, protectedRangeRequest, dataValidationRequest, parseSheetsData } from "./google_sheet_api.js";
import { configurationCorePropertyMap, configurationCustomPropertyMap, classificationOptionMap, classificationGroupOptionMap, databaseConnectionUrl } from "./config.js";
import { DatabaseService } from "./database_service.js"
import dayjs from 'dayjs';
import { JSONPath } from 'jsonpath-plus';

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/config/service-account-token.json`;

const databaseModel = new DatabaseModel();


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
/*
const composeGeneralSheetRow = function (element) {
    let row = [
        element.guid != null ? element.guid : '',
        element.name != null ? element.name : '',
        `${element.classification?.code != null ? element.classification.code : ''} ${element.classification.name != null ? element.classification.name : ''}`,
        `${element.classificationGroup?.code != null ? element.classificationGroup.code : ''} ${element.classificationGroup.name != null ? element.classificationGroup.name : ''}`,
        element.type != null ? element.type : '',
        element.variation != null ? element.variation : '',
        element.libraryPart?.documentName != null ? element.libraryPart.documentName : '',
        element.libraryPart?.index != null ? element.libraryPart.index : '',
        element.libraryPart?.uniqueId != null ? element.libraryPart.uniqueId : '',
        element.modiStamp != null ? element.modiStamp : ''
    ];

    return row;
}
*/

const composeGeneralSheetRow = function (sheetMetaData, element) {
    let row = [];

    for (const field of sheetMetaData.fields) {
        const result = JSONPath({ path: field.path, json: element });
        const value = result?.length > 0 && result[0] != null ? result[0] : "";
        row.push(value);
    }

    return row;
}

/*
const composeCorePropertySheetRow = function (element, generalSheetRowIndex, configPropertyMap, elementProperties) {
    let row = [
        element.guid,
        `='Element Name & Classification'!B${generalSheetRowIndex + 2}`,
        `='Element Name & Classification'!C${generalSheetRowIndex + 2}`,
        ...configPropertyMap.map(propertyName => {
            return elementProperties.get(propertyName) != null ? elementProperties.get(propertyName) : '';
        })
    ];

    return row;
}
*/

const composeCorePropertySheetRow = function (generalSheetRowIndex, sheetMetaData, element) {
    let row = [
        element.guid,
        `='Element Name & Classification'!B${generalSheetRowIndex + 2}`,
        `='Element Name & Classification'!C${generalSheetRowIndex + 2}`,
        ...sheetMetaData.fields.map(field => {
            const result = JSONPath({ path: field.path, json: element });
            const value = result?.length > 0 && result[0] != null ? result[0] : "";
            return value;
        })
    ];

    return row;
}

/*
const composeCustomPropertySheetRow = function (element, configPropertyMap, elementProperties) {
    let row = [
        element.guid,
        ...configPropertyMap.map(propertyName => {
            return elementProperties.get(propertyName) != null ? elementProperties.get(propertyName) : '';
        })
    ];

    return row;
}
*/

const composeCustomPropertySheetRow = function (sheetMetaData, element) {
    let row = [
        element.guid,
        ...sheetMetaData.fields.map(field => {
            const result = JSONPath({ path: field.path, json: element });
            const value = result?.length > 0 && result[0] != null ? result[0] : "";
            return value;
        })
    ];

    return row;
}

/*
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
        const generalSheetRowData = composeGeneralSheetRow(element);
        let generalSheetRowIndex = generalSheet.values.findIndex(row => row[0] == element.guid);

        if (generalSheetRowIndex == -1) {
            // Add the element to the "Element & Classification" sheet.
            extendRowSet.set(generalSheet.name, extendRowSet.get(generalSheet.name) == null ? 1 : extendRowSet.get(generalSheet.name) + 1);
            generalSheetRowIndex = generalSheet.values.length;
            generalSheet.values.push(generalSheetRowData);
        }

        changeSet.push({
            range: `'${generalSheet.name}'!A${generalSheetRowIndex + 2}`,
            values: [generalSheetRowData],
        });

        // Handle the "Element & Classification" sheet.

        // Handle the core property sheets.
        for (const corePtyGpName of configurationCorePropertyMap.keys()) {
            const corePropertySheet = corePropertySheets.get(corePtyGpName);
            let corePropertySheetRowData = composeCorePropertySheetRow(element, generalSheetRowIndex, configurationCorePropertyMap.get(corePtyGpName), element.coreProperties.get(corePtyGpName));
            let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == element.guid);

            if (corePropertySheetRowIndex == -1) {
                extendRowSet.set(corePtyGpName, extendRowSet.get(corePtyGpName) == null ? 1 : extendRowSet.get(corePtyGpName) + 1);
                corePropertySheetRowIndex = corePropertySheet.values.length;
                corePropertySheet.values.push(corePropertySheetRowData);
            }

            changeSet.push({
                range: `'${corePropertySheet.name}'!A${corePropertySheetRowIndex + 2}`,
                values: [corePropertySheetRowData],
            });
        }
        // Handle the core property sheets.

        // Handle the custom property sheet.
        if (element.customProperties.size > 0) {
            for (const customPtyGpName of element.customProperties.keys()) {
                if (!configurationCustomPropertyMap.has(customPtyGpName)) {
                    continue;
                }

                const customPropertySheet = customPropertySheets.get(customPtyGpName);
                let customPropertySheetRowData = composeCustomPropertySheetRow(element, configurationCustomPropertyMap.get(customPtyGpName), element.customProperties.get(customPtyGpName));
                let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == element.guid);

                if (customPropertySheetRowIndex == -1) {
                    extendRowSet.set(customPtyGpName, extendRowSet.get(customPtyGpName) == null ? 1 : extendRowSet.get(customPtyGpName) + 1);
                    customPropertySheetRowIndex = customPropertySheet.values.length;
                    customPropertySheet.values.push(customPropertySheetRowData);
                }

                changeSet.push({
                    range: `'${customPropertySheet.name}'!A${customPropertySheetRowIndex + 2}`,
                    values: [customPropertySheetRowData],
                });
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
                if (!deleteRowSet.has(generalSheet.name)) {
                    deleteRowSet.set(generalSheet.name, []);
                }
                deleteRowSet.get(generalSheet.name).push(generalSheetRowIndex + 1);
            }

            for (const corePtyGpName of configurationCorePropertyMap.keys()) {
                const corePropertySheet = corePropertySheets.get(corePtyGpName);
                let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == guid);

                if (corePropertySheetRowIndex > -1) {
                    if (!deleteRowSet.has(corePropertySheet.name)) {
                        deleteRowSet.set(corePropertySheet.name, []);
                    }
                    deleteRowSet.get(corePropertySheet.name).push(corePropertySheetRowIndex + 1);
                }
            }

            for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
                const customPropertySheet = customPropertySheets.get(customPtyGpName);
                let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == guid);

                if (customPropertySheetRowIndex > -1) {
                    if (!deleteRowSet.has(customPropertySheet.name)) {
                        deleteRowSet.set(customPropertySheet.name, []);
                    }
                    deleteRowSet.get(customPropertySheet.name).push(customPropertySheetRowIndex + 1);
                }
            }
        });

        if (deleteRowSet.size > 0) {
            for (let [sheetName, deleteRowIndexList] of deleteRowSet.entries()) {
                deleteRowIndexList.sort((a, b) => b - a);

                const response = await sheetService.batchUpdate({
                    spreadsheetId: spreadSheetMetaData.id,
                    resource: {
                        requests: deleteRowIndexList.map(deleteRowIndex => {
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
            }
        }
    }


    // Remove the deleted elements from the sheets.
}*/

const updateSheetsData = async function (sheetService, spreadSheetMetaData, scheduleMetaData, syncData) {
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
        const generalSheetRowData = composeGeneralSheetRow(scheduleMetaData.sheets.find(sheet => { return sheet.sheetType == "general" }), element);
        let generalSheetRowIndex = generalSheet.values.findIndex(row => row[0] == element.guid);

        if (generalSheetRowIndex == -1) {
            // Add the element to the "Element & Classification" sheet.
            extendRowSet.set(generalSheet.name, extendRowSet.get(generalSheet.name) == null ? 1 : extendRowSet.get(generalSheet.name) + 1);
            generalSheetRowIndex = generalSheet.values.length;
            generalSheet.values.push(generalSheetRowData);
        }

        changeSet.push({
            range: `'${generalSheet.name}'!A${generalSheetRowIndex + 2}`,
            values: [generalSheetRowData],
        });

        // Handle the "Element & Classification" sheet.

        // Handle the core property sheets.

        const corePropertyGroups = scheduleMetaData.sheets.filter(sheet => { return sheet.sheetType == "core" });

        for (const corePropertyGroup of corePropertyGroups) {
            const corePropertySheet = corePropertySheets.get(corePropertyGroup.sheetName);
            let corePropertySheetRowData = composeCorePropertySheetRow(generalSheetRowIndex, corePropertyGroup, element);
            let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == element.guid);

            if (corePropertySheetRowIndex == -1) {
                extendRowSet.set(corePtyGpName, extendRowSet.get(corePtyGpName) == null ? 1 : extendRowSet.get(corePtyGpName) + 1);
                corePropertySheetRowIndex = corePropertySheet.values.length;
                corePropertySheet.values.push(corePropertySheetRowData);
            }

            changeSet.push({
                range: `'${corePropertySheet.name}'!A${corePropertySheetRowIndex + 2}`,
                values: [corePropertySheetRowData],
            });
        }
        // Handle the core property sheets.

        // Handle the custom property sheet.
        if (Object.keys(element.customProperties).length > 0) {
            for (const customPtyGpName of Object.keys(element.customProperties)) {
                if (!configurationCustomPropertyMap.has(customPtyGpName)) {
                    continue;
                }

                const customPropertyGroup = scheduleMetaData.sheets.find(sheet => { return sheet.sheetType == "custom" && sheet.sheetName == customPtyGpName });
                const customPropertySheet = customPropertySheets.get(customPtyGpName);
                let customPropertySheetRowData = composeCustomPropertySheetRow(customPropertyGroup, element);
                let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == element.guid);

                if (customPropertySheetRowIndex == -1) {
                    extendRowSet.set(customPtyGpName, extendRowSet.get(customPtyGpName) == null ? 1 : extendRowSet.get(customPtyGpName) + 1);
                    customPropertySheetRowIndex = customPropertySheet.values.length;
                    customPropertySheet.values.push(customPropertySheetRowData);
                }

                changeSet.push({
                    range: `'${customPropertySheet.name}'!A${customPropertySheetRowIndex + 2}`,
                    values: [customPropertySheetRowData],
                });
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
                if (!deleteRowSet.has(generalSheet.name)) {
                    deleteRowSet.set(generalSheet.name, []);
                }
                deleteRowSet.get(generalSheet.name).push(generalSheetRowIndex + 1);
            }

            for (const corePtyGpName of configurationCorePropertyMap.keys()) {
                const corePropertySheet = corePropertySheets.get(corePtyGpName);
                let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == guid);

                if (corePropertySheetRowIndex > -1) {
                    if (!deleteRowSet.has(corePropertySheet.name)) {
                        deleteRowSet.set(corePropertySheet.name, []);
                    }
                    deleteRowSet.get(corePropertySheet.name).push(corePropertySheetRowIndex + 1);
                }
            }

            for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
                const customPropertySheet = customPropertySheets.get(customPtyGpName);
                let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == guid);

                if (customPropertySheetRowIndex > -1) {
                    if (!deleteRowSet.has(customPropertySheet.name)) {
                        deleteRowSet.set(customPropertySheet.name, []);
                    }
                    deleteRowSet.get(customPropertySheet.name).push(customPropertySheetRowIndex + 1);
                }
            }
        });

        if (deleteRowSet.size > 0) {
            for (let [sheetName, deleteRowIndexList] of deleteRowSet.entries()) {
                deleteRowIndexList.sort((a, b) => b - a);

                const response = await sheetService.batchUpdate({
                    spreadsheetId: spreadSheetMetaData.id,
                    resource: {
                        requests: deleteRowIndexList.map(deleteRowIndex => {
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
            }
        }
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
    let projectCode = null;
    let dataFileName = null;

    if (args.length % 2 !== 0) {
        console.error('Invalid arguments');
        process.exit(1);
    }

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--direction":
                direction = args[++i];
                break;
            case "--project":
                projectCode = args[++i];
                break;
            case "--dataFile":
                dataFileName = args[++i];
                break;
        }
    }

    if (direction == null) {
        console.error('Direction is required.');
        process.exit(1);
    }

    if (projectCode == null) {
        console.error('Project Name is required.');
        process.exit(1);
    }

    if (dataFileName == null) {
        console.error('Data file name is required.');
        process.exit(1);
    }

    return [direction, projectCode, dataFileName];
}

async function main(args) {
    // Retrieve the file name from the command line arguments.
    const [direction, projectCode, dataFileName] = handleConsoleArguments(args);

    console.log(`direction = ${direction}`);
    console.log(`projectCode = ${projectCode}`);
    console.log(`dataFileName = ${dataFileName}`);

    const dataFilePath = `${homedir()}/bohm/files/${dataFileName}`;

    // 

    // Initialize the MongoDB connection.
    const mongoService = new DatabaseService(databaseConnectionUrl, "bohm");

    // Initialize the Google Drive API and Google Sheets API connection.
    const auth = new GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"],
    });

    const sheetService = google.sheets({ version: "v4", auth }).spreadsheets;
    const driveService = google.drive({ version: "v3", auth });
    // Initialize the Google Drive API and Google Sheets API connection.

    await mongoService.connect().then(async () => {
        // assume project and schedule in place at the moment.
        let dbProject = await mongoService.findOne("projects", { code: projectCode });
        let dbSchedules = dbProject.schedules;

        if (direction === "push") {
            if (!existsSync(dataFilePath)) {
                console.error("Data file not found");
                process.exit(1);
            }

            const fileSyncData = parseDataSyncFile(dataFilePath);

            let dbElements = await mongoService.findMany("elements", { guid: { $in: fileSyncData.elements.map(element => { return element.guid; }) } });
            let dbNewElements = fileSyncData.elements.filter(element => !dbElements.some(dbElement => dbElement.guid === element.guid));
            let dbDeletedElements = await mongoService.findMany("elements", { guid: { $in: fileSyncData.deletedElements } });

            // Handle element updates and persist into DB.
            for (let dbElement of dbElements) {
                let snapshot = structuredClone(dbElement);
                delete snapshot._id;
                snapshot.timestamp = new Date();
                snapshot.from = "archicad";
                snapshot.fromExternalId = null;

                await mongoService.insertOne("elementSnapshots", snapshot);

                const element = fileSyncData.elements.find(element => element.guid === dbElement.guid);

                if (element != null) {
                    dbElement.name = element.name;
                    dbElement.classification = element.classification;
                    dbElement.classificationGroup = element.classificationGroup;
                    dbElement.coreProperties = element.coreProperties;
                    dbElement.customProperties = element.customProperties;

                    await mongoService.updateOne("elements", { guid: element.guid }, dbElement);
                }
            }
            // Handle element updates and persist into DB.

            // Handle new elements from ArchiCAD.
            if (dbNewElements.length > 0) {
                await mongoService.insertMany("elements", dbNewElements);
            }
            // Handle new elements from ArchiCAD.

            // Handle deleted elements from ArchiCAD.
            if (dbDeletedElements.length > 0) {
                for (let dbDeletedElement of dbDeletedElements) {
                    let snapshot = structuredClone(dbDeletedElement);
                    delete snapshot._id;
                    snapshot.timestamp = new Date();
                    snapshot.from = "archicad";
                    snapshot.fromExternalId = null;

                    await mongoService.insertOne("elementSnapshots", snapshot);
                }

                await mongoService.deleteMany("elements", { guid: { $in: dbDeletedElements.map(dbElement => { return dbElement.guid; }) } });
            }
            // Handle deleted elements from ArchiCAD.

            // Handle Google Sheet updates.
            if (dbSchedules.length > 0) {
                let spreadSheetId = dbSchedules[0].externalId;

                const spreadSheetMetaData = spreadSheetId == null ?
                    await createMasterSpreadsheet(driveService, sheetService, fileSyncData.name) :
                    await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);

                await updateSheetsData(sheetService, spreadSheetMetaData, dbSchedules[0], fileSyncData);
            }
            // Handle Google Sheet updates.



        } else if (direction === "pull") {
            if (dbSchedules.length > 0) {
                let spreadSheetId = dbSchedules[0].externalId;

                const spreadSheetMetaData = spreadSheetId == null ?
                    await createMasterSpreadsheet(driveService, sheetService, syncData.name) :
                    await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);

                const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await getAllSheetData(sheetService, spreadSheetMetaData);
                const syncData = parseSheetsData(projectSheet, generalSheet, corePropertySheets, customPropertySheets);


                await Promise.all(syncData.elements.map(async element => {
                    // Current workaround as Google Sheet does not have the project code.
                    element.projectCode = dbProject.code;

                    const dbElement = await mongoService.findOne("elements", { guid: element.guid });

                    if (dbElement == null) {
                        console.error("Element not found in the database.");
                        return;
                    }

                    let fieldsChanged = [];

                    await Promise.all(dbSchedules[0].sheets.map(async sheet => {
                        if (sheet.sheetType == "core" ||
                            (sheet.sheetType == "custom" && sheet.sheetName == element.classificationGroup.full)) {
                            for (const field of sheet.fields) {
                                if (field.editable) {
                                    const sheetResult = JSONPath({ path: field.path, json: element });
                                    const sheetValue = sheetResult?.length > 0 && sheetResult[0] != null ? sheetResult[0] : null;
                                    const dbResult = JSONPath({ path: field.path, json: dbElement });
                                    const dbValue = dbResult?.length > 0 && dbResult[0] != null ? dbResult[0] : null;

                                    if (sheetValue != dbValue) {
                                        fieldsChanged.push({ path: field.path, newValue: sheetValue });
                                    }
                                }
                            }
                        }
                    }));

                    if (fieldsChanged.length > 0) {
                        console.log(`${element.guid}: ${fieldsChanged.length} fields changed.`);

                        // Take a snapshot of the current element.
                        let snapshot = structuredClone(dbElement);
                        delete snapshot._id;
                        snapshot.timestamp = new Date();
                        snapshot.from = "schedule";
                        snapshot.fromExternalId = dbSchedules[0].externalId;

                        await mongoService.insertOne("elementSnapshots", snapshot);

                        // Update the element in the database.
                        for (const field of fieldsChanged) {
                            await JSONPath({
                                path: field.path, json: dbElement, resultType: 'all',
                                callback: (value, _, { parent, parentProperty }) => {
                                    parent[parentProperty] = field.newValue;
                                }
                            });
                        }
                        // Update the element in the database.

                        // Persist into database.
                        await mongoService.updateOne("elements", { guid: element.guid }, dbElement);


                    }
                }));

                /*
                for (let element of syncData.elements) {
                    // Current workaround as Google Sheet does not have the project code.
                    element.projectCode = dbProject.code;
    
                    const dbElement = await mongoService.findOne("elements", { guid: element.guid });
    
                    if (dbElement == null) {
                        console.error("Element not found in the database.");
                        continue;
                    }
    
                    let fieldsChanged = [];
    
                    for (const sheet of dbSchedules[0].sheets) {
                        if (sheet.sheetType == "core" ||
                            (sheet.sheetType == "custom" && sheet.sheetName == element.classificationGroup.full)) {
                            for (const field of sheet.fields) {
                                if (field.editable) {
                                    const sheetResult = JSONPath({ path: field.path, json: element });
                                    const sheetValue = sheetResult?.length > 0 ? sheetResult[0] : null;
                                    const dbResult = JSONPath({ path: field.path, json: dbElement });
                                    const dbValue = dbResult?.length > 0 ? dbResult[0] : null;
    
                                    if (sheetValue != dbValue) {
                                        fieldsChanged.push({ path: field.path, newValue: sheetValue });
                                    }
                                }
                            }
                        }
                    }
    
                    if (fieldsChanged.length > 0) {
                        console.log(`${element.guid}: ${fieldsChanged.length} fields changed.`);
    
                        // Take a snapshot of the current element.
                        let snapshot = structuredClone(dbElement);
                        delete snapshot._id;
                        snapshot.timestamp = new Date();
                        snapshot.from = "schedule";
                        snapshot.fromExternalId = dbSchedules[0].externalId;
    
                        await mongoService.insertOne("elementSnapshots", snapshot);
    
                        // Update the element in the database.
                        for (const field of fieldsChanged) {
                            await JSONPath({
                                path: field.path, json: dbElement, resultType: 'all',
                                callback: (value, _, { parent, parentProperty }) => {
                                    parent[parentProperty] = field.newValue;
                                }
                            });
                        }
                        // Update the element in the database.
    
                        // Persist into database.
                        await mongoService.updateOne("elements", { guid: element.guid }, dbElement);
                    }
                }
                */

                // grab all the data from database and export to XML to compare in ArchiCAD.
                dbProject.elements = await mongoService.findMany("elements", { projectCode: dbProject.code });
                dbProject.deletedElements = [];

                const syncXmlDoc = composeSyncXmlData(dbProject);

                try {
                    // add-on-import-data.xml
                    writeFileSync(dataFilePath, create({ encoding: "UTF-8", standalone: false }, syncXmlDoc).end({ prettyPrint: true }));

                    console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: ${dataFilePath} has been saved.`);
                } catch (error) {
                    console.error(error);
                }
            } else {
                console.log("Schedule not found in the database.");
            }
        }

        // const [direction, dataFileName, spreadSheetId] = handleConsoleArguments(args);

        // // Initialize the Google Drive API and Google Sheets API connection.
        // const auth = new GoogleAuth({
        //     scopes: [
        //         "https://www.googleapis.com/auth/spreadsheets",
        //         "https://www.googleapis.com/auth/drive"],
        // });

        // const sheetService = google.sheets({ version: "v4", auth }).spreadsheets;
        // const driveService = google.drive({ version: "v3", auth });
        // // Initialize the Google Drive API and Google Sheets API connection.

        // const dataFilePath = `${homedir()}/bohm/files/${dataFileName}`;

        // if (direction === "push") {
        //     if (!existsSync(dataFilePath)) {
        //         console.error("Data file not found");
        //         return;
        //     }

        //     const syncFile = readFileSync(dataFilePath, "utf8");
        //     const syncXmlDoc = new DOMParser().parseFromString(syncFile, "text/xml");

        //     const syncData = await parseSyncXmlData(syncXmlDoc);

        //     const spreadSheetMetaData = spreadSheetId == null ?
        //         await createMasterSpreadsheet(driveService, sheetService, syncData.name) :
        //         await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);

        //     await updateSheetsData(sheetService, spreadSheetMetaData, syncData);

        //     console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: Data sheet name: ${spreadSheetMetaData.name}`);
        //     console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: Data sheet ID: ${spreadSheetMetaData.id}`);
        //     console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: Data sheet URL: ${spreadSheetMetaData.url}`);
        // } else if (direction === "pull") {
        //     const spreadSheetMetaData = await getSpreadSheetProperty(sheetService, spreadSheetId, true, true);
        //     const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await getAllSheetData(sheetService, spreadSheetMetaData);

        //     const syncData = parseSheetsData(projectSheet, generalSheet, corePropertySheets, customPropertySheets);

        //     const syncXmlDoc = composeSyncXmlData(syncData);

        //     try {
        //         // add-on-import-data.xml
        //         writeFileSync(dataFilePath, create({ encoding: "UTF-8", standalone: false }, syncXmlDoc).end({ prettyPrint: true }));

        //         console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: ${dataFilePath} has been saved.`);
        //     } catch (error) {
        //         console.error(error);
        //     }
        // }
    }).finally(() => {
        mongoService.disconnect();
    });
}

// main().catch(console.error);
main(process.argv.slice(2)).catch(console.error);
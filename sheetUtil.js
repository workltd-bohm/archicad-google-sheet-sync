import dayjs from "dayjs";
import pino from "pino";
import { JSONPath } from "jsonpath-plus";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import { GoogleSheetService } from "./google_sheet_api.js";
import { configurationCorePropertyMap, configurationCustomPropertyMap, classificationOptionMap, classificationGroupOptionMap } from "./config.js";

const logger = pino({ level: "info" });

export class SheetUtil {
    static async composeProjectDtoFromSheets(sheetService, spreadSheetMetaData, scheduleMetadata) {

        const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await this.getAllSheetData(sheetService, spreadSheetMetaData, scheduleMetadata);

        let project = {
            name: null,
            elements: [],
            deletedElements: []
        };

        project.name = projectSheet.values[0][1];

        for (const row of generalSheet.values) {
            let element = {
                guid: row[0]?.trim(),
                projectCode: null,
                name: row[1]?.trim(),
                type: row[4]?.trim(),
                variation: row[5]?.trim(),
                zone: null,
                level: null,
                geometry: {
                    x: 0,
                    y: 0,
                    elevation: 0,
                    rotatingAngle: 0.0
                },
                dimension: {
                    width: 0,
                    height: 0,
                    depth: 0
                },
                location: null,
                material: null,
                finish: null,
                mount: null,
                modiStamp: row[9]?.trim(),
                classification: {
                    code: row[2]?.trim().split(' ')[0],
                    name: row[2]?.trim().split(' ').slice(1).join(' '),
                },
                classificationGroup: {
                    code: row[3]?.trim().split(' ')[0],
                    name: row[3]?.trim().split(' ').slice(1).join(' ')
                },

                libraryPart: {
                    documentName: row[6]?.trim(),
                    index: row[7]?.trim(),
                    uniqueId: row[8]?.trim()
                },
                token: {
                    fungible: false,
                    contractAddress: null,
                    id: null
                },
                coreProperties: {},
                customProperties: {}
            };

            element.classification.full = (element.classification.code + ' ' + element.classification.name).trim();
            element.classificationGroup.full = (element.classificationGroup.code + ' ' + element.classificationGroup.name).trim();

            configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
                let corePtyRow = corePropertySheets.get(corePtyGpName)?.values?.find(corePtyRow => corePtyRow[0] == row[0]);
                element.coreProperties[corePtyGpName] = {};

                if (corePtyRow == null) {
                    corePtyRow = [row[0], row[1], row[2], ...Array(configurationCustomPropertyMap.get(corePtyGpName)?.length).fill(null)];
                }

                corePtyMap.forEach(corePtyName => {
                    const corePtyVal = corePtyRow[corePropertySheets.get(corePtyGpName)?.headers?.indexOf(corePtyName)];
                    if (corePtyVal?.trim()?.length > 0) {
                        element.coreProperties[corePtyGpName][corePtyName] = corePtyVal?.trim();
                    }

                });
            });

            if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
                const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;

                if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                    let customPtyRow = customPropertySheets.get(customPropertyGroupName)?.values?.find(customPtyRow => customPtyRow[0] == row[0]);
                    element.customProperties[customPropertyGroupName] = {};

                    if (customPtyRow == null) {
                        customPtyRow = [row[0], ...Array(configurationCustomPropertyMap.get(customPropertyGroupName)?.length).fill(null)];
                    }

                    configurationCustomPropertyMap.get(customPropertyGroupName)?.forEach(customPtyName => {
                        const customPtyVal = customPtyRow[customPropertySheets.get(customPropertyGroupName)?.headers?.indexOf(customPtyName)];
                        if (customPtyVal?.trim()?.length > 0) {
                            element.customProperties[customPropertyGroupName][customPtyName] = customPtyVal?.trim();
                        }
                    });
                }
            }

            project.elements.push(element);
        }

        return project;
    }

    static composeGeneralSheetRow(sheetMetaData, element) {
        let row = [];

        for (const field of sheetMetaData.fields) {
            const value = this.getValueByPath(element, field.path);
            // const result = JSONPath({ path: field.path, json: element });
            // const value = result?.length > 0 && result[0] != null ? result[0] : "";
            row.push(value);
        }

        return row;
    }

    static composeCorePropertySheetRow(generalSheetRowIndex, sheetMetaData, element) {
        let row = [
            element.guid,
            `='Element Name & Classification'!B${generalSheetRowIndex + 2}`,
            `='Element Name & Classification'!C${generalSheetRowIndex + 2}`,
            ...sheetMetaData.fields.map(field => {
                // const result = JSONPath({ path: field.path, json: element });
                // const value = result?.length > 0 && result[0] != null ? result[0] : "";
                const value = this.getValueByPath(element, field.path);
                return value;
            })
        ];

        return row;
    }

    static composeCustomPropertySheetRow(sheetMetaData, element) {
        let row = [
            element.guid,
            ...sheetMetaData.fields.map(field => {
                // const result = JSONPath({ path: field.path, json: element });
                // const value = result?.length > 0 && result[0] != null ? result[0] : "";
                const value = this.getValueByPath(element, field.path);
                return value;
            })
        ];

        return row;
    }

    static async getAllSheetData(sheetService, spreadSheetMetaData, scheduleMetaData) {
        const projectSheet = await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, "Project Information", false);
        const generalSheet = await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, "Element Name & Classification", true);

        let corePropertySheets = new Map();
        let customPropertySheets = new Map();

        const corePropertyGroupsMetadata = scheduleMetaData.sheets.filter(sheet => { return sheet.sheetType == "core" });

        for (const corePropertyGroupMetadata of corePropertyGroupsMetadata) {
            corePropertySheets.set(corePropertyGroupMetadata.sheetName, await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, corePropertyGroupMetadata.sheetName, true));
        }

        const customPropertyGroupsMetadata = scheduleMetaData.sheets.filter(sheet => { return sheet.sheetType == "custom" });

        for (const customPropertyGroupMetadata of customPropertyGroupsMetadata) {
            customPropertySheets.set(customPropertyGroupMetadata.sheetName, await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, customPropertyGroupMetadata.sheetName, true));
        }

        return [projectSheet, generalSheet, corePropertySheets, customPropertySheets];
    }

    static async syncAllSheetData(sheetService, spreadSheetMetaData, scheduleMetaData, projectDto) {
        logger.info(`Started to retrieve all data of the spreadsheet [${spreadSheetMetaData.name}].`);

        let [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await this.getAllSheetData(sheetService, spreadSheetMetaData, scheduleMetaData);

        // changeSet.push({
        //     range: `'${projectSheet.name}'!A1`,
        //     values: [["Project Name", syncData.name]],
        // });

        logger.info(`Completed to retrieve all data of the spreadsheet [${spreadSheetMetaData.name}].`);

        logger.info(`Start to delete all data from the spreadsheet [${spreadSheetMetaData.name}].`);

        const responseGeneralSheetCleanup = await sheetService.batchUpdate({
            spreadsheetId: spreadSheetMetaData.id,
            resource: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: spreadSheetMetaData.sheets.find(sheet => sheet.name === generalSheet.name)?.id,
                                dimension: "ROWS",
                                startIndex: 1,
                                endIndex: generalSheet.values.length + 2
                            }
                        }
                    }
                ]
            }
        });

        generalSheet.values = [];

        for (const corePropertySheetName of corePropertySheets.keys()) {
            const responseCoreSheetCleanup = await sheetService.batchUpdate({
                spreadsheetId: spreadSheetMetaData.id,
                resource: {
                    requests: [
                        {
                            deleteDimension: {
                                range: {
                                    sheetId: spreadSheetMetaData.sheets.find(sheet => sheet.name === corePropertySheetName)?.id,
                                    dimension: "ROWS",
                                    startIndex: 1,
                                    endIndex: corePropertySheets.get(corePropertySheetName).values.length + 2
                                }
                            }
                        }
                    ]
                }
            });

            corePropertySheets.get(corePropertySheetName).values = [];
        }

        for (const customPropertySheetName of customPropertySheets.keys()) {
            const responseCustomSheetCleanup = await sheetService.batchUpdate({
                spreadsheetId: spreadSheetMetaData.id,
                resource: {
                    requests: [
                        {
                            deleteDimension: {
                                range: {
                                    sheetId: spreadSheetMetaData.sheets.find(sheet => sheet.name === customPropertySheetName)?.id,
                                    dimension: "ROWS",
                                    startIndex: 1,
                                    endIndex: customPropertySheets.get(customPropertySheetName).values.length + 2
                                }
                            }
                        }
                    ]
                }
            });

            customPropertySheets.get(customPropertySheetName).values = [];
        }

        logger.info(`Completed to delete all data from the spreadsheet [${spreadSheetMetaData.name}].`);

        logger.info(`Started to prepare data for the spreadsheet [${spreadSheetMetaData.name}].`);

        for (const element of projectDto.elements) {
            // Handle the "Element & Classification" sheet.
            const generalSheetMetadata = scheduleMetaData.sheets.find(sheet => { return sheet.sheetType == "general" });
            const generalSheetRowData = this.composeGeneralSheetRow(generalSheetMetadata, element);
            generalSheet.values.push(generalSheetRowData);
            const generalSheetRowIndex = generalSheet.values.length - 1;

            const corePropertyGroupsMetadata = scheduleMetaData.sheets.filter(sheet => { return sheet.sheetType == "core" });

            for (const corePropertyGroupMetadata of corePropertyGroupsMetadata) {
                const corePropertySheet = corePropertySheets.get(corePropertyGroupMetadata.sheetName);
                let corePropertySheetRowData = this.composeCorePropertySheetRow(generalSheetRowIndex, corePropertyGroupMetadata, element);
                corePropertySheet.values.push(corePropertySheetRowData);
            }

            // Handle the custom property sheet.
            if (Object.keys(element.customProperties).length > 0) {
                for (const customPtyGpName of Object.keys(element.customProperties)) {
                    if (!configurationCustomPropertyMap.has(customPtyGpName)) {
                        continue;
                    }

                    const customPropertyGroupMetadata = scheduleMetaData.sheets.find(sheet => { return sheet.sheetType == "custom" && sheet.sheetName == customPtyGpName });

                    if (customPropertyGroupMetadata == undefined || customPropertyGroupMetadata == null) {
                        continue;
                    }

                    const customPropertySheet = customPropertySheets.get(customPtyGpName);
                    let customPropertySheetRowData = this.composeCustomPropertySheetRow(customPropertyGroupMetadata, element);
                    customPropertySheet.values.push(customPropertySheetRowData);
                }
            }
        }

        console.log(`Completed to prepare data for the spreadsheet [${spreadSheetMetaData.name}].`);

        console.log(`Started to populate the data into the spreadsheet [${spreadSheetMetaData.name}].`);

        const auth = new GoogleAuth({
            scopes: [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive"],
        });



        const testService = google.sheets({ version: "v4", auth }).spreadsheets;

        const responsePopulateGeneralSheet = await testService.values.batchUpdate({
            spreadsheetId: spreadSheetMetaData.id,
            resource: {
                data: {
                    range: `'${generalSheet.name}'!A2`,
                    values: generalSheet.values,
                },
                valueInputOption: "USER_ENTERED"
            }
        });

        await this.wait(5000);

        for (const corePropertySheetName of corePropertySheets.keys()) {
            const responsePopulateCoreSheet = await sheetService.values.batchUpdate({
                spreadsheetId: spreadSheetMetaData.id,
                resource: {
                    data: {
                        range: `'${corePropertySheetName}'!A2`,
                        values: corePropertySheets.get(corePropertySheetName).values,
                    },
                    valueInputOption: "USER_ENTERED"
                }
            });

            await this.wait(5000);
        }

        for (const customPropertySheetName of customPropertySheets.keys()) {
            const responsePopulateCustomSheet = await sheetService.values.batchUpdate({
                spreadsheetId: spreadSheetMetaData.id,
                resource: {
                    data: {
                        range: `'${customPropertySheetName}'!A2`,
                        values: customPropertySheets.get(customPropertySheetName).values,
                    },
                    valueInputOption: "USER_ENTERED"
                }
            });

            await this.wait(5000);
        }

        console.log(`Completed to populate the data into the spreadsheet [${spreadSheetMetaData.name}].`);
    }

    static async createSpreadsheet(driveService, sheetService, scheduleMetaData, projectName) {
        const sheetNames = ["Project Information",
            scheduleMetaData.sheets.find(sheet => sheet.sheetType == "general").sheetName,
            ...scheduleMetaData.sheets.filter(sheet => sheet.sheetType == "core").map(sheet => sheet.sheetName),
            ...scheduleMetaData.sheets.filter(sheet => sheet.sheetType == "custom").map(sheet => sheet.sheetName),
            "[Reserved] Classification List",
            "[Reserved] Classification Group List"
        ];

        const spreadSheetMetaData = await GoogleSheetService.createSpreadSheet(driveService, sheetService, `${projectName} - ${scheduleMetaData.name} [${dayjs().format('YYYY-MM-DD HH:mm:ss')}]`, sheetNames);

        // Populate base data.
        let changeSet = [];
        let formattingRequests = [];

        changeSet.push({
            range: "'Project Information'!A1",
            values: [["Project Name"]],
        });

        //
        // Populate the general sheet with header and formatting.
        //
        const generalSheet = scheduleMetaData.sheets.find(sheet => sheet.sheetType == "general");

        changeSet.push({
            range: `'${generalSheet.sheetName}'!A1`,
            values: [[...generalSheet.fields.map(field => field.columnName)]],
            // "Element GUID", "Element Name", "Classification", "Classification Group", "Element Type", "Type Variation", "Library Part Name", "Library Part Index", "Library Part GUID", "MOD Stamp"
        });

        formattingRequests.push(...GoogleSheetService.formatHeaderRequests(spreadSheetMetaData.sheets.find(sheet => sheet.name === generalSheet.sheetName)?.id));
        formattingRequests.push(GoogleSheetService.dataValidationRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === generalSheet.sheetName)?.id, 1, 2, 3, `='[Reserved] Classification List'!A1:A${classificationOptionMap.size}`, "Select a classification."));
        formattingRequests.push(GoogleSheetService.dataValidationRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === generalSheet.sheetName)?.id, 1, 3, 4, `='[Reserved] Classification Group List'!A1:A${classificationGroupOptionMap.size}`, "Select a classification group."));

        for (let i = 0; i < generalSheet.fields.length; i++) {
            if (!generalSheet.fields[i].editable) {
                formattingRequests.push(GoogleSheetService.protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === generalSheet.sheetName)?.id, 1, i, i + 1));
            }
        }
        //
        // Populate the general sheet with header and formatting.
        //

        //
        // Populate the core property sheets with header and formatting.
        //
        const coreSheets = scheduleMetaData.sheets.filter(sheet => sheet.sheetType == "core");

        for (const coreSheet of coreSheets) {
            changeSet.push({
                range: `'${coreSheet.sheetName}'!A1`,
                values: [["Element GUID", "Element Name", "Classification", ...coreSheet.fields.map(field => field.columnName)]],
            });

            formattingRequests.push(...GoogleSheetService.formatHeaderRequests(spreadSheetMetaData.sheets.find(sheet => sheet.name === coreSheet.sheetName)?.id));
            formattingRequests.push(GoogleSheetService.protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === coreSheet.sheetName)?.id, 1, 0, 3));

            for (let i = 0; i < coreSheet.fields.length; i++) {
                if (!coreSheet.fields[i].editable) {
                    formattingRequests.push(GoogleSheetService.protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === coreSheet.sheetName)?.id, 1, i + 3, i + 4));
                }
            }
        }
        //
        // Populate the core property sheets with header and formatting.
        //

        //
        // Populate the custom property sheets with header and formatting.
        //
        const customSheets = scheduleMetaData.sheets.filter(sheet => sheet.sheetType == "custom");

        for (const customSheet of customSheets) {
            changeSet.push({
                range: `'${customSheet.sheetName}'!A1`,
                values: [["Element GUID", ...customSheet.fields.map(field => field.columnName)]],
            });

            formattingRequests.push(...GoogleSheetService.formatHeaderRequests(spreadSheetMetaData.sheets.find(sheet => sheet.name === customSheet.sheetName)?.id));

            for (let i = 0; i < customSheet.fields.length; i++) {
                if (!customSheet.fields[i].editable) {
                    formattingRequests.push(GoogleSheetService.protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === customSheet.sheetName)?.id, 1, i + 1, i + 2));
                }
            }
        }
        //
        // Populate the custom property sheets with header and formatting.
        //

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

    static getValueByPath(obj, path) {
        const properties = path.split(/(?<!\.)\.(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/).map(seg => seg.replace(/^"|"$/g, ''));

        // Reduce the properties array to drill down into the object
        return properties.reduce((current, property) => {
            return current && Object.hasOwnProperty.call(current, property) ? current[property] : undefined;
        }, obj);
    }

    static setValueByPath(obj, path, value) {
        let current = obj;

        const properties = path.split(/(?<!\.)\.(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/).map(seg => seg.replace(/^"|"$/g, ''));

        for (let i = 0; i < properties.length - 1; i++) {
            const property = properties[i];

            // If the property doesn't exist or isn't an object, create it or overwrite it
            if (!current[property] || typeof current[property] !== 'object') {
                current[property] = {};
            }
            current = current[property];
        }

        // Set the value at the last property
        const lastProperty = properties[properties.length - 1];
        current[lastProperty] = value;
    }

    static wait(n) {
        return new Promise((resolve) => setTimeout(resolve, n));
    }
}
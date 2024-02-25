import dayjs from 'dayjs';
import { JSONPath } from 'jsonpath-plus';
import { GoogleSheetService } from "./google_sheet_api.js";
import { configurationCorePropertyMap, configurationCustomPropertyMap, classificationOptionMap, classificationGroupOptionMap } from "./config.js";

export class SheetUtil {
    static async composeProjectDtoFromSheets(sheetService, spreadSheetMetaData) {

        const [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await this.getAllSheetData(sheetService, spreadSheetMetaData);

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
                let corePtyRow = corePropertySheets.get(corePtyGpName).values.find(corePtyRow => corePtyRow[0] == row[0]);
                element.coreProperties[corePtyGpName] = {};

                if (corePtyRow == null) {
                    corePtyRow = [row[0], row[1], row[2], ...Array(configurationCustomPropertyMap.get(customPropertyGroupName).length).fill(null)];
                }

                corePtyMap.forEach(corePtyName => {
                    const corePtyVal = corePtyRow[corePropertySheets.get(corePtyGpName).headers.indexOf(corePtyName)];
                    if (corePtyVal?.trim()?.length > 0) {
                        element.coreProperties[corePtyGpName][corePtyName] = corePtyVal?.trim();
                    }

                });
            });

            if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
                const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;

                if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                    let customPtyRow = customPropertySheets.get(customPropertyGroupName).values.find(customPtyRow => customPtyRow[0] == row[0]);
                    element.customProperties[customPropertyGroupName] = {};

                    if (customPtyRow == null) {
                        customPtyRow = [row[0], ...Array(configurationCustomPropertyMap.get(customPropertyGroupName).length).fill(null)];
                    }

                    configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                        const customPtyVal = customPtyRow[customPropertySheets.get(customPropertyGroupName).headers.indexOf(customPtyName)];
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
            const result = JSONPath({ path: field.path, json: element });
            const value = result?.length > 0 && result[0] != null ? result[0] : "";
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
                const result = JSONPath({ path: field.path, json: element });
                const value = result?.length > 0 && result[0] != null ? result[0] : "";
                return value;
            })
        ];

        return row;
    }

    static composeCustomPropertySheetRow(sheetMetaData, element) {
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

    static async getAllSheetData(sheetService, spreadSheetMetaData) {
        const projectSheet = await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, "Project Information", false);
        const generalSheet = await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, "Element Name & Classification", true);

        let corePropertySheets = new Map();
        let customPropertySheets = new Map();


        for (const corePtyGpName of configurationCorePropertyMap.keys()) {
            corePropertySheets.set(corePtyGpName, await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, corePtyGpName, true));
        }

        for (const customPtyGpName of configurationCustomPropertyMap.keys()) {
            customPropertySheets.set(customPtyGpName, await GoogleSheetService.getSheetData(sheetService, spreadSheetMetaData, customPtyGpName, true));
        }

        return [projectSheet, generalSheet, corePropertySheets, customPropertySheets];
    }

    static async syncAllSheetDataBatch(sheetService, spreadSheetMetaData, scheduleMetaData, generalSheet, corePropertySheets, customPropertySheets, elementDtos) {
        let changeSet = [];
        let extendRowSet = new Map();

        // Compare the data and update the Google Sheet.
        for (const element of elementDtos) {
            // Handle the "Element & Classification" sheet.
            const generalSheetRowData = this.composeGeneralSheetRow(scheduleMetaData.sheets.find(sheet => { return sheet.sheetType == "general" }), element);
            let generalSheetRowIndex = generalSheet.values.findIndex(row => row[0] == element.guid);

            if (generalSheetRowIndex == -1) {
                // Add the element to the "Element & Classification" sheet.
                extendRowSet.set(generalSheet.name, extendRowSet.get(generalSheet.name) == null ? 1 : extendRowSet.get(generalSheet.name) + 1);
                generalSheetRowIndex = generalSheet.values.length;
                generalSheet.values.push(generalSheetRowData);
            } else {
                // Update the element in the "Element & Classification" sheet.
                generalSheet.values[generalSheetRowIndex] = generalSheetRowData;
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
                let corePropertySheetRowData = this.composeCorePropertySheetRow(generalSheetRowIndex, corePropertyGroup, element);
                let corePropertySheetRowIndex = corePropertySheet.values.findIndex(row => row[0] == element.guid);

                if (corePropertySheetRowIndex == -1) {
                    extendRowSet.set(corePropertyGroup.sheetName, extendRowSet.get(corePropertyGroup.sheetName) == null ? 1 : extendRowSet.get(corePropertyGroup.sheetName) + 1);
                    corePropertySheetRowIndex = corePropertySheet.values.length;
                    corePropertySheet.values.push(corePropertySheetRowData);
                } else {
                    corePropertySheet.values[corePropertySheetRowIndex] = corePropertySheetRowData;
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
                    let customPropertySheetRowData = this.composeCustomPropertySheetRow(customPropertyGroup, element);
                    let customPropertySheetRowIndex = customPropertySheet.values.findIndex(row => row[0] == element.guid);

                    if (customPropertySheetRowIndex == -1) {
                        extendRowSet.set(customPtyGpName, extendRowSet.get(customPtyGpName) == null ? 1 : extendRowSet.get(customPtyGpName) + 1);
                        customPropertySheetRowIndex = customPropertySheet.values.length;
                        customPropertySheet.values.push(customPropertySheetRowData);
                    } else {
                        customPropertySheet.values[customPropertySheetRowIndex] = customPropertySheetRowData;
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
    }

    static async syncAllSheetData(sheetService, spreadSheetMetaData, scheduleMetaData, projectDto) {
        let [projectSheet, generalSheet, corePropertySheets, customPropertySheets] = await this.getAllSheetData(sheetService, spreadSheetMetaData);

        // changeSet.push({
        //     range: `'${projectSheet.name}'!A1`,
        //     values: [["Project Name", syncData.name]],
        // });

        const elementBatchSetCount = Math.ceil(projectDto.elements.length / 1000);

        for (let i = 0; i < elementBatchSetCount; i++) {
            const elementDtos = projectDto.elements.slice(i * 1000, (i + 1) * 1000);
            await this.syncAllSheetDataBatch(sheetService, spreadSheetMetaData, scheduleMetaData, generalSheet, corePropertySheets, customPropertySheets, elementDtos);

            console.log(`Processed ${(i + 1) * 1000} elements.`);
        }



        // Remove the deleted elements from the sheets.
        if (projectDto.deletedElements.length > 0) {
            let deleteRowSet = new Map();

            projectDto.deletedElements.forEach(guid => {
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

    static async createSpreadsheet(driveService, sheetService, scheduleMetaData, projectName) {
        const sheetNames = ["Project Information",
            scheduleMetaData.sheets.find(sheet => sheet.sheetType == "general").sheetName,
            ...scheduleMetaData.sheets.filter(sheet => sheet.sheetType == "core").map(sheet => sheet.sheetName),
            ...scheduleMetaData.sheets.filter(sheet => sheet.sheetType == "custom").map(sheet => sheet.sheetName),
            // "Element Name & Classification",
            // ...Array.from(configurationCorePropertyMap.keys()),
            // ...Array.from(configurationCustomPropertyMap.keys()),
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
        formattingRequests.push(GoogleSheetService.protectedRangeRequest(spreadSheetMetaData.sheets.find(sheet => sheet.name === generalSheet.sheetName)?.id, 1, 9, 10));
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
}
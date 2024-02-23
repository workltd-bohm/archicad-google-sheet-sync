import { grantPermission } from './google_drive_api.js';
import { configurationCorePropertyMap, configurationCustomPropertyMap } from "./config.js";

export const parseSheetsData = function (projectSheet, generalSheet, corePropertySheets, customPropertySheets) {
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

export const formatHeaderRequests = function (sheetId) {
    return [{
        updateSheetProperties: {
            properties: {
                sheetId: sheetId,
                gridProperties: { frozenRowCount: 1 }
            },
            fields: "gridProperties.frozenRowCount"
        }
    }, {
        repeatCell: {
            range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1  // header row.
            },
            cell: {
                userEnteredFormat: {
                    backgroundColor: { red: 0.0, green: 0.0, blue: 0.0 },
                    textFormat: {
                        foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                        bold: true
                    }
                }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
    }, {
        repeatCell: {
            range: {
                sheetId: sheetId,
                startRowIndex: 0,
                startColumnIndex: 0
            },
            cell: {
                userEnteredFormat: {
                    wrapStrategy: "CLIP"
                }
            },
            fields: "userEnteredFormat.wrapStrategy"
        }
    }, {
        updateDimensionProperties: {
            range: {
                sheetId: sheetId, // Adjust if your column is in a different sheet
                dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                startIndex: 0 // zero-based index
            },
            properties: {
                pixelSize: 300 // set the new width
            },
            fields: 'pixelSize' // specify the fields to update
        }
    }];
}

export const protectedRangeRequest = function (sheetId, startRowIndex, startColumnIndex, endColumnIndex) {
    return {
        addProtectedRange: {
            protectedRange: {
                range: {
                    sheetId: sheetId,
                    startRowIndex: startRowIndex,
                    startColumnIndex: startColumnIndex,
                    endColumnIndex: endColumnIndex,
                },
                description: 'This range is protected',
                warningOnly: false,
                editors: {
                    users: ['google-sheets-user@sincere-bay-406415.iam.gserviceaccount.com'], // Users who can edit the protected range
                }
            }
        }
    };
}

export const dataValidationRequest = function (sheetId, classOptionSize, classGpOptionSize) {
    return [{
        setDataValidation: {
            range: {
                sheetId: sheetId,
                startRowIndex: 1,
                startColumnIndex: 2,
                endColumnIndex: 3
            },
            rule: {
                condition: {
                    type: "ONE_OF_RANGE",
                    values: [
                        {
                            userEnteredValue: `='[Reserved] Classification List'!A1:A${classOptionSize}`
                        }
                    ]
                },
                inputMessage: "Select a classification.",
                showCustomUi: true,
                strict: true
            }
        }
    }, {
        setDataValidation: {
            range: {
                sheetId: sheetId,
                startRowIndex: 1,
                startColumnIndex: 3,
                endColumnIndex: 4
            },
            rule: {
                condition: {
                    type: "ONE_OF_RANGE",
                    values: [
                        {
                            userEnteredValue: `='[Reserved] Classification Group List'!A1:A${classGpOptionSize}`
                        }
                    ]
                },
                inputMessage: "Select a classification.",
                showCustomUi: true,
                strict: true
            }
        }
    }];
}

export const getSpreadSheetProperty = async function (service, spreadSheetId, includeSheets = false, includeDeveloperMetadata = false) {
    const result = await service.get({
        "spreadsheetId": spreadSheetId,
        "includeGridData": false,
    });

    return result?.data != null ? mapSpreadsheetProperty(result.data, includeSheets, includeDeveloperMetadata) : null;
}

export const getSheetProperty = async function (service, spreadSheetId, sheetId) {
    const result = await service.get({
        "spreadsheetId": spreadSheetId,
        "includeGridData": false,
    });

    let sheet = result?.data?.sheets.find(sheet => sheet.properties.sheetId === parseInt(sheetId));

    return sheet != undefined ? {
        spreadsheet: mapSpreadsheetProperty(result?.data, false, true),
        ...mapSheetProperty(sheet)
    } : null;
}

export const getSheetData = async function (service, spreadSheetMetaData, sheetName, hasHeader = false) {
    const result = await service.values.get({
        "spreadsheetId": spreadSheetMetaData.id,
        "range": `'${sheetName}'`,
    });

    let dataSheet = {
        id: spreadSheetMetaData.sheets.find(sheet => sheet.name === sheetName)?.id,
        name: sheetName,
        headers: [],
        values: []
    };

    if (result?.data?.values != null) {
        if (hasHeader) {
            dataSheet.headers = result.data.values[0];
            dataSheet.values = result.data.values.slice(1).map(row => {
                return trimSheetRow(row, result.data.values[0].length);
            });
        } else {
            let maxLength = Math.max(...result.data.values.map(innerArray => innerArray.length));

            dataSheet.values = result.data.values.map(row => {
                return trimSheetRow(row, maxLength);
            });
        }
    }

    return dataSheet;
};

export const createSpreadSheet = async function (drive_service, sheet_service, spreadSheetName, sheetNames) {
    let spreadSheet = null;

    let response = await sheet_service.create({
        resource: {
            properties: { title: spreadSheetName },
            sheets: sheetNames.map(sheetName => {
                return {
                    properties: {
                        title: sheetName
                    }
                }
            })
        }
    });

    if (response?.status == 200) {
        grantPermission(drive_service, response.data?.spreadsheetId);
        spreadSheet = mapSpreadsheetProperty(response.data, true, true);
    }

    return spreadSheet;
}

const trimSheetRow = function (row, maxLength) {
    return row.length < maxLength ? row.concat(Array(maxLength - row.length).fill(null)) : row.slice(0, maxLength);
}

const mapSpreadsheetProperty = function (spreadsheet, includeSheets = false, includeDeveloperMetadata = false) {
    return {
        id: spreadsheet?.spreadsheetId,
        name: spreadsheet?.properties.title,
        url: spreadsheet?.spreadsheetUrl,
        properties: spreadsheet?.properties,
        sheets: includeSheets ? spreadsheet?.sheets.map(sheet => {
            return {
                id: sheet.properties?.sheetId,
                index: sheet.properties?.index,
                name: sheet.properties?.title,
                hidden: sheet.properties?.hidden == undefined ? false : sheet.properties.hidden,
                numOfRows: sheet.properties?.gridProperties?.rowCount,
                numOfColumns: sheet.properties?.gridProperties?.columnCount
            };
        }) : null,
        developerMetadata: includeDeveloperMetadata && spreadsheet?.developerMetadata != null ? spreadsheet.developerMetadata : null
    };
}

const mapSheetProperty = function (sheet) {
    return {
        id: sheet?.properties?.sheetId,
        index: sheet?.properties?.index,
        name: sheet?.properties?.title,
        hidden: sheet?.properties?.hidden == undefined ? false : sheet.properties.hidden,
        numOfRows: sheet?.properties?.gridProperties?.rowCount,
        numOfColumns: sheet?.properties?.gridProperties?.columnCount
    };
};


import { grantPermission } from './google_drive_api.js';
export class GoogleSheetService {
    static async createSpreadSheet(drive_service, sheet_service, spreadSheetName, sheetNames) {
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
            await grantPermission(drive_service, response.data?.spreadsheetId);
            spreadSheet = this.mapSpreadsheetProperty(response.data, true, true);
        }

        return spreadSheet;
    }

    static formatHeaderRequests(sheetId) {
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

    static protectedRangeRequest(sheetId, startRowIndex, startColumnIndex, endColumnIndex) {
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

    static dataValidationRequest(sheetId, startRowIndex, startColumnIndex, endColumnIndex, range, errorMessage) {
        return {
            setDataValidation: {
                range: {
                    sheetId: sheetId,
                    startRowIndex: startRowIndex,
                    startColumnIndex: startColumnIndex,
                    endColumnIndex: endColumnIndex
                },
                rule: {
                    condition: {
                        type: "ONE_OF_RANGE",
                        values: [
                            {
                                userEnteredValue: range
                            }
                        ]
                    },
                    inputMessage: errorMessage,
                    showCustomUi: true,
                    strict: true
                }
            }
        };
    }

    static async getSheetData(service, spreadSheetMetaData, sheetName, hasHeader = false) {
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
                    return this.trimSheetRow(row, result.data.values[0].length);
                });
            } else {
                let maxLength = Math.max(...result.data.values.map(innerArray => innerArray.length));

                dataSheet.values = result.data.values.map(row => {
                    return this.trimSheetRow(row, maxLength);
                });
            }
        }

        return dataSheet;
    };

    static trimSheetRow(row, maxLength) {
        return row.length < maxLength ? row.concat(Array(maxLength - row.length).fill(null)) : row.slice(0, maxLength);
    }

    static async getSpreadSheetProperty(service, spreadSheetId, includeSheets = false, includeDeveloperMetadata = false) {
        const result = await service.get({
            "spreadsheetId": spreadSheetId,
            "includeGridData": false,
        });

        return result?.data != null ? this.mapSpreadsheetProperty(result.data, includeSheets, includeDeveloperMetadata) : null;
    }

    static async getSheetProperty(service, spreadSheetId, sheetId) {
        const result = await service.get({
            "spreadsheetId": spreadSheetId,
            "includeGridData": false,
        });

        let sheet = result?.data?.sheets.find(sheet => sheet.properties.sheetId === parseInt(sheetId));

        return sheet != undefined ? {
            spreadsheet: this.mapSpreadsheetProperty(result?.data, false, true),
            ...this.mapSheetProperty(sheet)
        } : null;
    }

    static mapSpreadsheetProperty(spreadsheet, includeSheets = false, includeDeveloperMetadata = false) {
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

    static mapSheetProperty(sheet) {
        return {
            id: sheet?.properties?.sheetId,
            index: sheet?.properties?.index,
            name: sheet?.properties?.title,
            hidden: sheet?.properties?.hidden == undefined ? false : sheet.properties.hidden,
            numOfRows: sheet?.properties?.gridProperties?.rowCount,
            numOfColumns: sheet?.properties?.gridProperties?.columnCount
        };
    }
}

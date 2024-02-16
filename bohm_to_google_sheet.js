import { homedir } from 'os';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { DOMParser } from '@xmldom/xmldom'
import { readFileSync } from 'fs';
import { select, select1 } from 'xpath';
import { configCorePtyMap, configCustomPtyMap, getSheet, getFullSheet } from './common.js';
import dayjs from 'dayjs';

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/service-account-token.json`;

async function parseExportData(exportXmlDoc) {
    let projectInfoDatasheet = [];
    let classDataSheet = [];
    let classGroupDataSheet = [];
    let generalDatasheet = { headers: [], values: [] };
    let corePtyDatasheetSet = {};
    let customPtyDatasheetSet = {};
    let deletedElementGuids = [];

    projectInfoDatasheet = [['Project Name', select1("/project/@name", exportXmlDoc).value]];

    generalDatasheet.headers.push(...["Element GUID", "Element Name", "Classification", "Classification Group", "Element Type",
        "Type Variation", "Library Part Name", "Library Part Index", "Library Part GUID", "modiStamp"]);

    for (const classOption of select("/project/classification-options/classification", exportXmlDoc)) {
        const classOptionDisplay = `${select1("@code", classOption).value} ${select1("@name", classOption).value}`;
        if (classOptionDisplay.length > 1)
            classDataSheet.push([classOptionDisplay])
    }

    for (const classGpOption of select("/project/classification-group-options/classification", exportXmlDoc)) {
        const classGpOptionDisplay = `${select1("@code", classGpOption).value} ${select1("@name", classGpOption).value}`;
        if (classGpOptionDisplay.length > 1)
            classGroupDataSheet.push([classGpOptionDisplay])
    }

    for (let corePtyGpName of Object.keys(configCorePtyMap)) {
        corePtyDatasheetSet[corePtyGpName] = { name: corePtyGpName, headers: [], values: [] };
        corePtyDatasheetSet[corePtyGpName].headers.push('Element GUID');
        corePtyDatasheetSet[corePtyGpName].headers.push('Element Name');
        corePtyDatasheetSet[corePtyGpName].headers.push('Classification');

        for (let corePtyName of configCorePtyMap[corePtyGpName]) {
            corePtyDatasheetSet[corePtyGpName].headers.push(corePtyName);
        }
    }

    for (let customPtyGpName of Object.keys(configCustomPtyMap)) {
        customPtyDatasheetSet[customPtyGpName] = { name: customPtyGpName, headers: [], values: [] };
        customPtyDatasheetSet[customPtyGpName].headers.push('Element GUID');

        for (let customPtyName of configCustomPtyMap[customPtyGpName]) {
            customPtyDatasheetSet[customPtyGpName].headers.push(customPtyName);
        }
    }

    for (const element of select("/project/elements/element", exportXmlDoc)) {
        let elemClass = select1("classification", element);
        let elemClassGp = select1("classification-group", element);
        let elemClassGpCode = select1("@code", elemClassGp).value;
        let elemClassGpName = select1("@name", elemClassGp).value;
        let elemLibPart = select1("library-part", element);

        generalDatasheet.values.push(
            [
                select1("@guid", element).value,
                select1("@name", element).value,
                `${select1("@code", elemClass).value} ${select1("@name", elemClass).value}`,
                `${elemClassGpCode} ${elemClassGpName}`,
                select1("@type", element).value,
                select1("@variation", element).value,
                select1("@documentName", elemLibPart).value,
                select1("@index", elemLibPart).value,
                select1("@uniqueId", elemLibPart).value,
                select1("@modiStamp", element).value
            ]
        );

        for (let corePtyGpName of Object.keys(configCorePtyMap)) {
            corePtyDatasheetSet[corePtyGpName].values.push(Array(corePtyDatasheetSet[corePtyGpName].headers.length).fill(null));
            const corePtyDatasheetSetRowIdx = corePtyDatasheetSet[corePtyGpName].values.length - 1
            corePtyDatasheetSet[corePtyGpName].values[corePtyDatasheetSetRowIdx][0] = select1("@guid", element).value;
            corePtyDatasheetSet[corePtyGpName].values[corePtyDatasheetSetRowIdx][1] = `='Element Name & Classification'!B${corePtyDatasheetSetRowIdx + 2}`;
            corePtyDatasheetSet[corePtyGpName].values[corePtyDatasheetSetRowIdx][2] = `='Element Name & Classification'!C${corePtyDatasheetSetRowIdx + 2}`;

            for (const elemCorePty of select(`core-property-groups/group[@name = '${corePtyGpName}']/property`, element)) {
                const elemCorePtyName = select1("@name", elemCorePty).value;
                const corePtyDatasheetSetColIdx = corePtyDatasheetSet[corePtyGpName].headers.indexOf(elemCorePtyName);
                corePtyDatasheetSet[corePtyGpName].values[corePtyDatasheetSetRowIdx][corePtyDatasheetSetColIdx] = select1("@value", elemCorePty).value;
            }
        }

        if (elemClassGpCode != null && elemClassGpName != null) {
            let elemCustomPtyGpName = elemClassGpCode + " " + elemClassGpName;

            if (elemCustomPtyGpName in configCustomPtyMap) {
                customPtyDatasheetSet[elemCustomPtyGpName].name = elemCustomPtyGpName;
                customPtyDatasheetSet[elemCustomPtyGpName].values.push(Array(customPtyDatasheetSet[elemCustomPtyGpName].headers.length).fill(null));

                const customPtyDatasheetSetRowIdx = customPtyDatasheetSet[elemCustomPtyGpName].values.length - 1;

                customPtyDatasheetSet[elemCustomPtyGpName].values[customPtyDatasheetSetRowIdx][0] = select1("@guid", element).value;

                for (const elemCustomPty of select("custom-property-groups/group/property", element)) {
                    const elemCustomPtyName = select1("@name", elemCustomPty).value;
                    const customPtyDatasheetSetColIdx = customPtyDatasheetSet[elemCustomPtyGpName].headers.indexOf(elemCustomPtyName);
                    customPtyDatasheetSet[elemCustomPtyGpName].values[customPtyDatasheetSetRowIdx][customPtyDatasheetSetColIdx] = select1("@value", elemCustomPty).value;
                }
            }
        }
    }

    for (const element of select("/project/deleted-elements/element", exportXmlDoc)) {
        deletedElementGuids.push(select1("@guid", element).value);
    }

    return [projectInfoDatasheet, generalDatasheet, corePtyDatasheetSet, customPtyDatasheetSet, classDataSheet, classGroupDataSheet, deletedElementGuids];
}

async function main(googleSheetId) {
    const auth = new GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"],
    });

    const sheet_service = google.sheets({ version: 'v4', auth }).spreadsheets;
    const drive_service = google.drive({ version: "v3", auth });

    const readData = readFileSync(homedir() + '/bohm/add-on-export-data.xml', 'utf8');

    const doc = new DOMParser().parseFromString(readData, 'text/xml');

    const [acProjectSHeet, acGeneralSheet, acCorePtySheetSet, acCustomPtySheetSet, acClassList, acClassGpList, deletedElementGuids] = await parseExportData(doc);

    // purely dump to a new Google Sheet.
    if (googleSheetId === undefined) {
        let sheets = [];

        sheets.push({ properties: { title: "Project Information" } });
        sheets.push({ properties: { title: "Element Name & Classification" } });

        for (let core_property_group_key of Object.keys(acCorePtySheetSet)) {
            sheets.push({ properties: { title: acCorePtySheetSet[core_property_group_key].name } });
        }

        for (let custom_property_group_key of Object.keys(acCustomPtySheetSet)) {
            sheets.push({ properties: { title: acCustomPtySheetSet[custom_property_group_key].name } });
        }

        sheets.push({ properties: { title: "[Reserved] Classification List" } });
        sheets.push({ properties: { title: "[Reserved] Classification Group List" } });

        let file_prop = {
            properties: { title: `${acProjectSHeet[0][1]} - Master Data List ${dayjs().format('YYYY-MM-DD HH:mm:ss')}` },
            "sheets": sheets
        }

        let response = await sheet_service.create({ resource: file_prop });

        googleSheetId = response.data.spreadsheetId;

        await drive_service.permissions.create({
            resource: {
                type: 'user',
                role: 'writer',
                emailAddress: 'google-sheets-user@sincere-bay-406415.iam.gserviceaccount.com'
            },
            fileId: googleSheetId,
            fields: 'id'
        });

        await drive_service.permissions.create({
            resource: {
                type: 'domain',
                role: 'writer',
                domain: 'workltd.co.uk'
            },
            fileId: googleSheetId,
            fields: 'id'
        });

        if (response.data == null || response.data.sheets == null || response.data.sheets.length < 3) { return; }

        let sheet_counter = 0;
        let gs_project_sheet_id = response.data.sheets[sheet_counter++].properties.sheetId;
        let gs_general_sheet_id = response.data.sheets[sheet_counter++].properties.sheetId;
        let gs_core_pty_sheet_id_list = []

        for (let core_property_group_key of Object.keys(acCorePtySheetSet)) {
            gs_core_pty_sheet_id_list[core_property_group_key] = response.data.sheets[sheet_counter++].properties.sheetId;
        }

        let gs_custom_pty_sheet_id_list = {};

        for (let i = sheet_counter; i < response.data.sheets.length - 2; i++) {
            gs_custom_pty_sheet_id_list[response.data.sheets[i].properties.title] = response.data.sheets[i].properties.sheetId;
        }

        let gs_class_list_sheet_id = response.data.sheets[response.data.sheets.length - 2].properties.sheetId;
        let gs_class_gp_list_sheet_id = response.data.sheets[response.data.sheets.length - 1].properties.sheetId;

        // populate the sheets.
        let result_project_info = await sheet_service.values.update({
            spreadsheetId: googleSheetId,
            range: "'Project Information'!A1",
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: acProjectSHeet
            }
        });

        let result_general = await sheet_service.values.update({
            spreadsheetId: googleSheetId,
            range: "'Element Name & Classification'!A1",
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [...[acGeneralSheet.headers], ...acGeneralSheet.values]
            }
        });

        for (let core_property_group_key of Object.keys(acCorePtySheetSet)) {
            let result_core_pty = await sheet_service.values.update({
                spreadsheetId: googleSheetId,
                range: "'" + acCorePtySheetSet[core_property_group_key].name + "'!A1",
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [...[acCorePtySheetSet[core_property_group_key].headers], ...acCorePtySheetSet[core_property_group_key].values]
                }
            });
        }

        for (let custom_property_group_key of Object.keys(acCustomPtySheetSet)) {
            let result_custom_pty = await sheet_service.values.update({
                spreadsheetId: googleSheetId,
                range: "'" + acCustomPtySheetSet[custom_property_group_key].name + "'!A1",
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [...[acCustomPtySheetSet[custom_property_group_key].headers], ...acCustomPtySheetSet[custom_property_group_key].values]
                }
            });
        }

        let result_class_list = await sheet_service.values.update({
            spreadsheetId: googleSheetId,
            range: "'[Reserved] Classification List'!A1",
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: acClassList
            }
        });

        let result_class_gp_list = await sheet_service.values.update({
            spreadsheetId: googleSheetId,
            range: "'[Reserved] Classification Group List'!A1",
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: acClassGpList
            }
        });
        // populate the sheets.

        // do the formatting.
        let requests = [];

        requests.push({
            updateSheetProperties: {
                properties: {
                    sheetId: gs_general_sheet_id,
                    gridProperties: { frozenRowCount: 1 }
                },
                fields: "gridProperties.frozenRowCount"
            }
        });

        requests.push({
            repeatCell: {
                range: {
                    sheetId: gs_general_sheet_id,
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
        });

        requests.push({
            repeatCell: {
                range: {
                    sheetId: gs_general_sheet_id,
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
        });

        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: gs_general_sheet_id, // Adjust if your column is in a different sheet
                    dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                    startIndex: 0, // zero-based index
                    endIndex: 1 // exclusive, hence not -1
                },
                properties: {
                    pixelSize: 300 // set the new width
                },
                fields: 'pixelSize' // specify the fields to update
            }
        });

        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: gs_general_sheet_id, // Adjust if your column is in a different sheet
                    dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                    startIndex: 1, // zero-based index
                    endIndex: 2 // exclusive, hence not -1
                },
                properties: {
                    pixelSize: 280 // set the new width
                },
                fields: 'pixelSize' // specify the fields to update
            }
        });

        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: gs_general_sheet_id, // Adjust if your column is in a different sheet
                    dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                    startIndex: 2, // zero-based index
                    endIndex: 3 // exclusive, hence not -1
                },
                properties: {
                    pixelSize: 280 // set the new width
                },
                fields: 'pixelSize' // specify the fields to update
            }
        });

        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: gs_general_sheet_id, // Adjust if your column is in a different sheet
                    dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                    startIndex: 3, // zero-based index
                },
                properties: {
                    pixelSize: 200 // set the new width
                },
                fields: 'pixelSize' // specify the fields to update
            }
        });

        requests.push({
            addProtectedRange: {
                protectedRange: {
                    range: {
                        sheetId: gs_general_sheet_id,
                        startRowIndex: 1,
                        startColumnIndex: 9,
                        endColumnIndex: 10,
                    },
                    description: 'This range is protected',
                    warningOnly: false,
                    editors: {
                        users: ['google-sheets-user@sincere-bay-406415.iam.gserviceaccount.com'], // Users who can edit the protected range
                    }
                }
            }
        });

        for (let core_property_group_key of Object.keys(gs_core_pty_sheet_id_list)) {
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key],
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
            });

            requests.push({
                updateSheetProperties: {
                    properties: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key],
                        gridProperties: { frozenRowCount: 1 }
                    },
                    fields: "gridProperties.frozenRowCount"
                }
            });

            requests.push({
                repeatCell: {
                    range: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key],
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
            });

            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key], // Adjust if your column is in a different sheet
                        dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                        startIndex: 0, // zero-based index
                        endIndex: 1 // exclusive, hence not -1
                    },
                    properties: {
                        pixelSize: 300 // set the new width
                    },
                    fields: 'pixelSize' // specify the fields to update
                }
            });

            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key], // Adjust if your column is in a different sheet
                        dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                        startIndex: 1, // zero-based index
                        endIndex: 2 // exclusive, hence not -1
                    },
                    properties: {
                        pixelSize: 280 // set the new width
                    },
                    fields: 'pixelSize' // specify the fields to update
                }
            });

            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key], // Adjust if your column is in a different sheet
                        dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                        startIndex: 2, // zero-based index
                        endIndex: 3 // exclusive, hence not -1
                    },
                    properties: {
                        pixelSize: 150 // set the new width
                    },
                    fields: 'pixelSize' // specify the fields to update
                }
            });

            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: gs_core_pty_sheet_id_list[core_property_group_key], // Adjust if your column is in a different sheet
                        dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                        startIndex: 3, // zero-based index
                    },
                    properties: {
                        pixelSize: 200 // set the new width
                    },
                    fields: 'pixelSize' // specify the fields to update
                }
            });

            requests.push({
                setBasicFilter: {
                    filter: {
                        range: {
                            sheetId: gs_core_pty_sheet_id_list[core_property_group_key], // Adjust as needed
                            startRowIndex: 0, // Assuming you want to start from the first row
                            startColumnIndex: 0, // Column B index (zero-based)
                            endColumnIndex: 3, // The end index is exclusive, so this effectively targets only column B
                        }
                    }
                }
            });

            requests.push({
                addProtectedRange: {
                    protectedRange: {
                        range: {
                            sheetId: gs_core_pty_sheet_id_list[core_property_group_key],
                            startRowIndex: 1,
                            startColumnIndex: 0,
                            endColumnIndex: 3,
                        },
                        description: 'This range is protected',
                        warningOnly: false,
                        editors: {
                            users: ['google-sheets-user@sincere-bay-406415.iam.gserviceaccount.com'], // Users who can edit the protected range
                        }
                    }
                }
            });
        }

        for (let custom_property_group_key of Object.keys(gs_custom_pty_sheet_id_list)) {
            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: gs_custom_pty_sheet_id_list[custom_property_group_key], // Adjust if your column is in a different sheet
                        dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                        startIndex: 0, // zero-based index
                        endIndex: 1 // exclusive, hence not -1
                    },
                    properties: {
                        pixelSize: 300 // set the new width
                    },
                    fields: 'pixelSize' // specify the fields to update
                }
            });

            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: gs_custom_pty_sheet_id_list[custom_property_group_key], // Adjust if your column is in a different sheet
                        dimension: 'COLUMNS', // Use 'ROWS' for adjusting row height
                        startIndex: 1, // zero-based index
                    },
                    properties: {
                        pixelSize: 200 // set the new width
                    },
                    fields: 'pixelSize' // specify the fields to update
                }
            });

            requests.push({
                repeatCell: {
                    range: {
                        sheetId: gs_custom_pty_sheet_id_list[custom_property_group_key],
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
            });

            requests.push({
                updateSheetProperties: {
                    properties: {
                        sheetId: gs_custom_pty_sheet_id_list[custom_property_group_key],
                        gridProperties: { frozenRowCount: 1 }
                    },
                    fields: "gridProperties.frozenRowCount"
                }
            });

            requests.push({
                repeatCell: {
                    range: {
                        sheetId: gs_custom_pty_sheet_id_list[custom_property_group_key],
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
            });
        }

        // setup data validation.
        requests.push({
            setDataValidation: {
                range: {
                    sheetId: gs_general_sheet_id,
                    startRowIndex: 1,
                    endRowIndex: acGeneralSheet.values.length + 1,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                },
                rule: {
                    condition: {
                        type: "ONE_OF_RANGE",
                        values: [
                            {
                                userEnteredValue: "='[Reserved] Classification List'!A1:A" + acClassList.length
                            }
                        ]
                    },
                    inputMessage: "Select a classification.",
                    showCustomUi: true,
                    strict: true
                }
            }
        });

        requests.push({
            setDataValidation: {
                range: {
                    sheetId: gs_general_sheet_id,
                    startRowIndex: 1,
                    endRowIndex: acGeneralSheet.values.length + 1,
                    startColumnIndex: 3,
                    endColumnIndex: 4
                },
                rule: {
                    condition: {
                        type: "ONE_OF_RANGE",
                        values: [
                            {
                                userEnteredValue: "='[Reserved] Classification Group List'!A1:A" + acClassGpList.length
                            }
                        ]
                    },
                    inputMessage: "Select a classification.",
                    showCustomUi: true,
                    strict: true
                }
            }
        });

        sheet_service.batchUpdate({
            spreadsheetId: googleSheetId,
            resource: { requests: requests }
        });

        console.log("Spreadsheet: " + googleSheetId);
        console.log("Spreadsheet: " + response.data.spreadsheetUrl);
    }
    // update an existing Google Sheet.
    else {
        let gsProjectInfoSheet = await getSheet(sheet_service, googleSheetId, 'Project Information', false);
        let gsGeneralSheet = await getSheet(sheet_service, googleSheetId, 'Element Name & Classification', true);
        let gsCorePtySheetSet = {};
        let gsCustomPtySheetSet = {};

        for (let corePtyGpSheetKey of Object.keys(configCorePtyMap)) {
            gsCorePtySheetSet[corePtyGpSheetKey] = await getSheet(sheet_service, googleSheetId, corePtyGpSheetKey, true);
        }

        for (let customPtyGpSheetKey of Object.keys(configCustomPtyMap)) {
            gsCustomPtySheetSet[customPtyGpSheetKey] = await getSheet(sheet_service, googleSheetId, customPtyGpSheetKey, true);
        }

        // Project Information sheet.
        if (gsProjectInfoSheet.values[0][1] === undefined ||
            gsProjectInfoSheet.values[0][1].trim().length == 0) {
            gsProjectInfoSheet.values[0][1] = acProjectSHeet[0][1];
            sheet_service.values.update({
                spreadsheetId: googleSheetId,
                range: "'Project Information'!A1",
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: gsProjectInfoSheet.values
                }
            });
        }
        // Project Information sheet.

        // General sheet.
        acGeneralSheet.values.forEach(acGeneralElem => {
            let gsGeneralElemIdx = gsGeneralSheet.values.findIndex(gsGeneralElem => gsGeneralElem[0] === acGeneralElem[0]);

            if (gsGeneralElemIdx === -1) {
                // append new element.
                gsGeneralSheet.values.push(acGeneralElem);
            } else {
                // update existing element.
                gsGeneralSheet.values[gsGeneralElemIdx] = acGeneralElem;
            }
        });

        sheet_service.values.update({
            spreadsheetId: googleSheetId,
            range: `'Element Name & Classification'!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [...[gsGeneralSheet.headers], ...gsGeneralSheet.values]
            }
        });
        // General sheet.

        // Core sheets.
        for (let corePtyGpSheetKey of Object.keys(acCorePtySheetSet)) {
            let gsCorePtyGpSheet = gsCorePtySheetSet[corePtyGpSheetKey];
            let acCorePtyGpSheet = acCorePtySheetSet[corePtyGpSheetKey];

            acCorePtyGpSheet.values.forEach(acCorePtyGpElem => {
                let gsCorePtyGpElemIdx = gsCorePtyGpSheet.values.findIndex(gsCorePtyGpElem => gsCorePtyGpElem[0] === acCorePtyGpElem[0]);

                if (gsCorePtyGpElemIdx === -1) {
                    // append new element.
                    gsCorePtyGpSheet.values.push(acCorePtyGpElem);
                } else {
                    // update existing element.
                    gsCorePtyGpSheet.values[gsCorePtyGpElemIdx] = acCorePtyGpElem;

                    gsCorePtyGpSheet.values[gsCorePtyGpElemIdx][1] = `='Element Name & Classification'!B${gsCorePtyGpElemIdx + 2}`;
                    gsCorePtyGpSheet.values[gsCorePtyGpElemIdx][2] = `='Element Name & Classification'!C${gsCorePtyGpElemIdx + 2}`;
                }
            });

            sheet_service.values.update({
                spreadsheetId: googleSheetId,
                range: `'${gsCorePtyGpSheet.name}'!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [...[gsCorePtyGpSheet.headers], ...gsCorePtyGpSheet.values]
                }
            });
        }
        // Core sheets.

        // Custom sheets.
        for (let customPtyGpSheetKey of Object.keys(acCustomPtySheetSet)) {
            let gsCustomPtyGpSheet = gsCustomPtySheetSet[customPtyGpSheetKey];
            let acCustomPtyGpSheet = acCustomPtySheetSet[customPtyGpSheetKey];

            acCustomPtyGpSheet.values.forEach(acCustomPtyGpElem => {
                let gsCustomPtyGpElemIdx = gsCustomPtyGpSheet.values.findIndex(gsCustomPtyGpElem => gsCustomPtyGpElem[0] === acCustomPtyGpElem[0]);

                if (gsCustomPtyGpElemIdx === -1) {
                    // append new element.
                    gsCustomPtyGpSheet.values.push(acCustomPtyGpElem);
                } else {
                    // update existing element.
                    gsCustomPtyGpSheet.values[gsCustomPtyGpElemIdx] = acCustomPtyGpElem;
                }
            });

            sheet_service.values.update({
                spreadsheetId: googleSheetId,
                range: `'${gsCustomPtyGpSheet.name}'!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [...[gsCustomPtyGpSheet.headers], ...gsCustomPtyGpSheet.values]
                }
            });
        }
        // Custom sheets.

        // Deleted elements.
        deletedElementGuids.forEach(deletedElementGuid => {
            // let gsGeneralElemIdx = gsGeneralSheet.values.findIndex(gsGeneralElem => gsGeneralElem[0] === deletedElementGuid);

            // requests.push({
            //     deleteDimension: {
            //         range: {
            //             sheetId: gs_general_sheet_id,
            //             dimension: 'ROWS',
            //             startIndex: gsGeneralElemIdx + 1,
            //             endIndex: gsGeneralElemIdx + 2
            //         }
            //     }
            // });

            // sheet_service.batchUpdate({
            //     spreadsheetId: googleSheetId,
            //     resource: { requests: requests }
            // });

        });

        // garbage clean up.
        // Check the classification group in general sheet, whether the corresponding entry is in the custom sheet.
        // gsGeneralSheet.values.forEach(gsGeneralElem => {
        //     let gsGeneralElemClassGp = gsGeneralElem[3];

        //     if (Object.keys(gsCustomPtySheetSet).includes(gsGeneralElemClassGp)) {
        //         let gsCustomPtyGpSheet = gsCustomPtySheetSet[gsGeneralElemClassGp];
        //         let gsCustomPtyGpElemIdx = gsCustomPtyGpSheet.values.findIndex(gsCustomPtyGpElem => gsCustomPtyGpElem[0] === gsGeneralElem[0]);

        //         if (gsCustomPtyGpElemIdx === -1) {
        //             // append new element.
        //             gsCustomPtyGpSheet.values.push([gsGeneralElem[0], ...Array(gsCustomPtyGpSheet.headers.length - 1).fill(null)]);
        //         }
        //     }
        // });
        // Check the classification group in general sheet, whether the corresponding entry is in the custom sheet.



        // 2. check any missing in those core sheets.
        // 3. delete elements from ArchiCAD.
        // garbage clean up.



        // TODO: reapply drop down list to newly created elements.

    }
}

const args = process.argv.slice(2);

main(args[0]).catch(console.error);

import { homedir } from 'os';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { DOMParser } from '@xmldom/xmldom'
import { readFileSync } from 'fs';
import { select, select1 } from 'xpath';
import { getSpreadSheetProperty, getSheetProperty, getSheetData, createSheet } from './google_sheet_api.js';
import dayjs from 'dayjs';
import { configurationCorePropertyMap, configurationCustomPropertyMap } from './config.js';

// process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/service-account-token.json`;


async function main(googleSheetId) {
    // const auth = new GoogleAuth({
    //     scopes: [
    //         "https://www.googleapis.com/auth/spreadsheets",
    //         "https://www.googleapis.com/auth/drive"],
    // });

    // const sheet_service = google.sheets({ version: 'v4', auth }).spreadsheets;
    // const drive_service = google.drive({ version: "v3", auth });

    // await getSpreadSheetProperty(sheet_service, "1FGIp5upZ-OePUOvm-k-yTpkqCSnf-Rtsoz0fKoHWj5Y", true, true).then(console.log);
    // console.log("-----------------");
    // await getSheetProperty(sheet_service, "1FGIp5upZ-OePUOvm-k-yTpkqCSnf-Rtsoz0fKoHWj5Y", "413129330").then(console.log);
    // console.log("-----------------");
    // let dataSheet = await getSheetData(sheet_service, "1FGIp5upZ-OePUOvm-k-yTpkqCSnf-Rtsoz0fKoHWj5Y", "00.00 SPECIFICATION", false);
    // createSheet(drive_service, sheet_service, "TestSheet", ["Sheet1", "Sheet2"]).then(console.log);

    // console.log(dataSheet.values[0]);
    // console.log(dataSheet.values);
    // console.log(configurationCorePropertyMap);
    // console.log(configurationCustomPropertyMap);
}

const args = process.argv.slice(2);

main(args[0]).catch(console.error);

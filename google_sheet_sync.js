import { homedir } from "os";
import dayjs from 'dayjs';
import { JSONPath } from 'jsonpath-plus';
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { create } from 'xmlbuilder2';
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { DatabaseModelUtil } from "./databaseModelUtil.js";
import { XmlFileUtil } from "./xmlFileUtil.js";
import { SheetUtil } from "./sheetUtil.js";
import { GoogleSheetService } from "./google_sheet_api.js";
import { databaseConnectionUrl } from "./config.js";
import { DatabaseService } from "./databaseService.js"

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/config/service-account-token.json`;

const handleConsoleArguments = function (args) {
    let direction = null;
    let projectName = null;
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
                projectName = args[++i];
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

    if (projectName == null) {
        console.error('Project Name is required.');
        process.exit(1);
    }

    if (dataFileName == null) {
        console.error('Data file name is required.');
        process.exit(1);
    }

    return [direction, projectName, dataFileName];
}

async function main(args) {
    // Retrieve the file name from the command line arguments.
    const [direction, projectName, dataFileName] = handleConsoleArguments(args);

    console.log(`direction = ${direction}`);
    console.log(`projectName = ${projectName}`);
    console.log(`dataFileName = ${dataFileName}`);

    const dataFilePath = `${homedir()}/bohm/files/${dataFileName}`;

    // Initialize the MongoDB connection.
    const dbService = new DatabaseService(databaseConnectionUrl, "bohm");

    // Initialize the Google Drive API and Google Sheets API connection.
    const auth = new GoogleAuth({
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"],
    });

    const sheetService = google.sheets({ version: "v4", auth }).spreadsheets;
    const driveService = google.drive({ version: "v3", auth });
    // Initialize the Google Drive API and Google Sheets API connection.

    // Connect to the database.
    await dbService.connect().catch(err => {
        console.error(err);
        process.exit(1);
    });

    // assume project and schedule in place at the moment.
    let dbProject = await dbService.findOne("projects", { name: projectName });

    if (!dbProject) {
        console.error(`Project with name [${projectName}] not found in the database.`);
        process.exit(1);
    }

    if (direction === "push") {
        if (!existsSync(dataFilePath)) {
            console.error("Data file not found");
            process.exit(1);
        }

        const projectDtoFromFile = XmlFileUtil.composeProjectDtoFromFile(dataFilePath);
        /*
        //
        // Start database synchronization.
        //
        let dbElements = await dbService.findMany("elements", { guid: { $in: projectDtoFromFile.elements.map(element => { return element.guid; }) } });
        let newElementDtosFromFile = projectDtoFromFile.elements.filter(element => !dbElements.some(dbElement => dbElement.guid === element.guid));
        let dbDeletedElements = await dbService.findMany("elements", { guid: { $in: projectDtoFromFile.deletedElements } });
        
        // Handle element updates and persist into DB.
        for (let dbElement of dbElements) {
            const dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbElement, "ArchiCAD", "Element updated.");
            await dbService.insertOne("elementSnapshots", dbElementSnapshot);
        
            const element = projectDtoFromFile.elements.find(element => element.guid === dbElement.guid);
        
            if (element != null) {
                dbElement.name = element.name;
                dbElement.classification = element.classification;
                dbElement.classificationGroup = element.classificationGroup;
                dbElement.coreProperties = element.coreProperties;
                dbElement.customProperties = element.customProperties;
        
                await dbService.updateOne("elements", { guid: element.guid }, dbElement);
            }
        }
        // Handle element updates and persist into DB.
        
        // Handle new elements from ArchiCAD.
        if (newElementDtosFromFile.length > 0) {
            const dbNewElements = newElementDtosFromFile.map(newElementDto => DatabaseModelUtil.composeElementModelFromDto(newElementDto, dbProject.code));
            await dbService.insertMany("elements", dbNewElements);
        }
        // Handle new elements from ArchiCAD.
        
        // Handle deleted elements from ArchiCAD.
        if (dbDeletedElements.length > 0) {
            for (let dbDeletedElement of dbDeletedElements) {
                const dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbDeletedElement, "ArchiCAD", "Element deleted.");
                await dbService.insertOne("elementSnapshots", dbElementSnapshot);
            }
        
            await dbService.deleteMany("elements", { guid: { $in: dbDeletedElements.map(dbElement => { return dbElement.guid; }) } });
        }
        // Handle deleted elements from ArchiCAD.
        
        //
        // End database synchronization.
        //

        */

        //
        // Start Google Sheet synchronization.
        //
        let dbSchedules = dbProject.schedules;

        for (const dbSchedule of dbSchedules) {
            const spreadSheetMetaData = dbSchedule.externalId?.length > 0 ?
                await GoogleSheetService.getSpreadSheetProperty(sheetService, dbSchedule.externalId, true, true) :
                await SheetUtil.createSpreadsheet(driveService, sheetService, dbSchedule, dbProject.name);

            if (spreadSheetMetaData == null) {
                console.error("Spreadsheet cannot be created or retrieved in Google Drive.");
                continue;
            }

            if (dbSchedule.externalId == null) {
                dbSchedule.externalId = spreadSheetMetaData.id;
                dbSchedule.externalUrl = spreadSheetMetaData.url;
            }

            await SheetUtil.syncAllSheetData(sheetService, spreadSheetMetaData, dbSchedule, projectDtoFromFile);
        }

        // Update the project record in the database, in case of changes in schedules sub-collection.
        await dbService.updateOne("projects", { name: projectName }, dbProject);
        //
        // End Google Sheet synchronization.
        //
    } else if (direction === "pull") {
        //
        // Start database synchronization.
        //
        let dbActiveSchedules = dbProject.schedules.filter(schedule => schedule.externalId?.length > 0);

        for (const dbSchedule of dbActiveSchedules) {
            const spreadSheetMetaData = await GoogleSheetService.getSpreadSheetProperty(sheetService, dbSchedule.externalId, true, true);

            if (spreadSheetMetaData == null) {
                console.error("Spreadsheet not found in Google Drive.");
                continue;
            }

            const sheetProjectDto = await SheetUtil.composeProjectDtoFromSheets(sheetService, spreadSheetMetaData);

            for (const sheetElementDto of sheetProjectDto.elements) {
                // Current workaround as Google Sheet does not have the project code.
                sheetElementDto.projectCode = dbProject.code;

                console.log(`Check element ${sheetElementDto.guid}`);

                const dbElement = await dbService.findOne("elements", { guid: sheetElementDto.guid });

                if (dbElement == null) {
                    console.error(`Element [${sheetElementDto.guid}] cannot be found in the database.`);
                    continue;
                }

                // Detect changes in all the fields editable in all sheets.
                let changeSet = [];

                for (const dbSheet of dbSchedule.sheets.filter(
                    sheet => sheet.sheetType == "core" ||
                        sheet.sheetType == "general" ||
                        (sheet.sheetType == "custom" && sheet.sheetName == sheetElementDto.classificationGroup.full))) {
                    for (const field of dbSheet.fields.filter(field => field.editable)) {
                        const sheetResult = JSONPath({ path: field.path, json: sheetElementDto });
                        const sheetValue = sheetResult?.length > 0 && sheetResult[0] != null ? sheetResult[0] : null;
                        const dbResult = JSONPath({ path: field.path, json: dbElement });
                        const dbValue = dbResult?.length > 0 && dbResult[0] != null ? dbResult[0] : null;

                        if (sheetValue != dbValue) {
                            changeSet.push({ path: field.path, newValue: sheetValue });
                        }
                    }
                }
                // Detect changes in all the fields editable in all sheets.

                // Apply changes to the database.
                if (changeSet.length > 0) {
                    console.log(`Element [${sheetElementDto.guid}]: ${changeSet.length} field(s) changed.`);

                    // Create a snapshot of the current element record in database.
                    let dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbElement, "Schedule", `Updated from ${dbSchedule.name}`);
                    await dbService.insertOne("elementSnapshots", dbElementSnapshot);

                    // Update the element record in the database.
                    for (const field of changeSet) {
                        await JSONPath({
                            path: field.path, json: dbElement, resultType: 'all',
                            callback: (value, _, { parent, parentProperty }) => {
                                parent[parentProperty] = field.newValue;
                            }
                        });
                    }

                    await dbService.updateOne("elements", { guid: sheetElementDto.guid }, dbElement);
                    // Update the dbElement in the database.
                }
                // Apply changes to the database.
            }
            //
            // End database synchronization.
            //

            //
            // Start ArchiCAD synchronization.
            //
            const dbElementsForExport = await dbService.findMany("elements", { projectCode: dbProject.code });
            const xmlProjectDto = DatabaseModelUtil.composeProjectDtoFromModel(dbProject, dbElementsForExport);
            const projectXmlDoc = XmlFileUtil.composeXmlObjectFromDto(xmlProjectDto);

            try {
                writeFileSync(dataFilePath, create({ encoding: "UTF-8", standalone: false }, projectXmlDoc).end({ prettyPrint: true }));

                console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: ${dataFilePath} has been saved.`);
            } catch (error) {
                console.error(error);
            }
            //
            // End ArchiCAD synchronization.
            //
        }
    }

    await dbService.disconnect();
}

main(process.argv.slice(2)).catch(console.error);
import { homedir } from "os";
import dayjs from 'dayjs';
import { JSONPath } from 'jsonpath-plus';
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import pino from "pino";
import { create } from 'xmlbuilder2';
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { DatabaseModelUtil } from "./databaseModelUtil.js";
import { XmlFileUtil } from "./xmlFileUtil.js";
import { SheetUtil } from "./sheetUtil.js";
import { GoogleSheetService } from "./google_sheet_api.js";
import { databaseConnectionUrl } from "./config.js";
import { DatabaseService } from "./databaseService.js";

const logger = pino({ level: "info" });

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

    logger.info(`direction = ${direction}`);
    logger.info(`projectName = ${projectName}`);
    logger.info(`dataFileName = ${dataFileName}`);

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

    logger.info(`Initialized the Google Drive API and Google Sheets API connection, using crendential in ${process.env["GOOGLE_APPLICATION_CREDENTIALS"]}.`);
    // Initialize the Google Drive API and Google Sheets API connection.

    // Connect to the database.
    await dbService.connect().catch(err => {
        console.error(err);
        process.exit(1);
    });

    logger.info(`Initialized the database connection.`);

    try {
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

            logger.info(`Data file [${dataFilePath}] has been read.`);
            logger.info(`Project loaded from file: ${projectDtoFromFile.name}`);
            logger.info(`Elements loaded from file: ${projectDtoFromFile.elements.length}`);

            logger.info(`Started the database synchronization process.`);

            //
            // Start database synchronization.
            //
            let dbElements = await dbService.findMany("elements", { guid: { $in: projectDtoFromFile.elements.map(element => { return element.guid; }) } });
            let newElementDtosFromFile = projectDtoFromFile.elements.filter(element => !dbElements.some(dbElement => dbElement.guid === element.guid));
            let dbDeletedElements = await dbService.findMany("elements", { guid: { $in: projectDtoFromFile.deletedElements } });

            logger.info(`Elements to be updated in the database: ${dbElements.length}`);
            logger.info(`New elements to be imported into database: ${newElementDtosFromFile.length}`);
            logger.info(`Elements to be deleted from database: ${dbDeletedElements.length}`);

            logger.info(`Started to update elements in the database.`);

            // Handle element updates and persist into DB.
            for (let dbElement of dbElements) {
                const dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbElement, "ArchiCAD", "Element updated.");
                await dbService.insertOne("elementSnapshots", dbElementSnapshot);

                logger.info(`Snapshot has been taken for the current element [${dbElement.guid}] in the database.`);

                const elementDtoFromFile = projectDtoFromFile.elements.find(element => element.guid === dbElement.guid);

                dbElement.name = elementDtoFromFile.name;
                dbElement.classification = elementDtoFromFile.classification;
                dbElement.classificationGroup = elementDtoFromFile.classificationGroup;
                dbElement.coreProperties = elementDtoFromFile.coreProperties;
                dbElement.customProperties = elementDtoFromFile.customProperties;

                await dbService.replaceOne("elements", { guid: elementDtoFromFile.guid }, dbElement);

                logger.info(`Element [${dbElement.guid}] has been updated in the database.`);
            }
            // Handle element updates and persist into DB.

            logger.info(`Completed to update elements in the database.`);

            // Handle new elements from ArchiCAD.
            if (newElementDtosFromFile.length > 0) {
                const dbNewElements = newElementDtosFromFile.map(newElementDto => DatabaseModelUtil.composeElementModelFromDto(newElementDto, dbProject.code));
                await dbService.insertMany("elements", dbNewElements);

                logger.info(`New elements have been saved into the database.`);
            }
            // Handle new elements from ArchiCAD.

            // Handle deleted elements from ArchiCAD.
            if (dbDeletedElements.length > 0) {
                for (let dbDeletedElement of dbDeletedElements) {
                    const dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbDeletedElement, "ArchiCAD", "Element deleted.");
                    await dbService.insertOne("elementSnapshots", dbElementSnapshot);

                    logger.info(`A snapshot has been taken for the deleted element [${dbDeletedElement.guid}].`);
                }

                await dbService.deleteMany("elements", { guid: { $in: dbDeletedElements.map(dbElement => { return dbElement.guid; }) } });

                logger.info(`Invalid elements have been deleted from the database.`);
            }
            // Handle deleted elements from ArchiCAD.

            //
            // End database synchronization.
            //

            logger.info(`Completed the database synchronization process.`);

            logger.info(`Started the Google Sheets synchronization process.`);

            //
            // Start Google Sheet synchronization.
            //
            let dbSchedules = dbProject.schedules;

            logger.info(`Schedules to be synchronized in Google Sheets: ${dbSchedules.length}`);

            for (const dbSchedule of dbSchedules) {
                logger.info(`Started to synchronize schedule [${dbSchedule.name}].`);

                const isExistingSchedule = dbSchedule.externalId?.length > 0;

                const spreadSheetMetaData = isExistingSchedule ?
                    await GoogleSheetService.getSpreadSheetProperty(sheetService, dbSchedule.externalId, true, true) :
                    await SheetUtil.createSpreadsheet(driveService, sheetService, dbSchedule, dbProject.name);

                const dbElementsForExport = isExistingSchedule ?
                    await dbService.findMany("elements", {
                        guid: {
                            $in:
                                [...dbElements.map(element => { return element.guid; }),
                                ...newElementDtosFromFile.map(element => { return element.guid; })]
                        }
                    }) :
                    await dbService.findMany("elements", { projectCode: dbProject.code });
                const xmlProjectDto = DatabaseModelUtil.composeProjectDtoFromModel(dbProject, dbElementsForExport, dbDeletedElements.map(dbElement => { return dbElement.guid; }));

                if (spreadSheetMetaData == null) {
                    console.error("Spreadsheet cannot be created or retrieved in Google Drive.");
                    continue;
                }

                if (dbSchedule.externalId == null) {
                    dbSchedule.externalName = spreadSheetMetaData.name;
                    dbSchedule.externalId = spreadSheetMetaData.id;
                    dbSchedule.externalUrl = spreadSheetMetaData.url;
                }

                logger.info(`Schedule spreadsheet details: ${spreadSheetMetaData.name} / ${dbSchedule.externalId} / ${dbSchedule.externalUrl}`);

                await SheetUtil.syncAllSheetData(sheetService, spreadSheetMetaData, dbSchedule, xmlProjectDto);
            }

            // Update the project record in the database, in case of changes in schedules sub-collection.
            await dbService.updateOne("projects", { name: projectName }, dbProject);
            //
            // End Google Sheet synchronization.
            //
            logger.info(`Completed the Google Sheets synchronization process.`);
        } else if (direction === "pull") {
            logger.info(`Started the database synchronization process.`);
            //
            // Start database synchronization.
            //
            let dbActiveSchedules = dbProject.schedules.filter(schedule => schedule.externalId?.length > 0);

            logger.info(`Active schedules to be synchronized in the database: ${dbActiveSchedules.length}`);

            for (const dbSchedule of dbActiveSchedules) {
                const spreadSheetMetaData = await GoogleSheetService.getSpreadSheetProperty(sheetService, dbSchedule.externalId, true, true);

                logger.info(`Started to synchronize schedule [${dbSchedule.name}].`);

                if (spreadSheetMetaData == null) {
                    logger.error("Spreadsheet not found in Google Drive.");
                    continue;
                }

                logger.info(`Started to extract element information from schedule [${dbSchedule.name}].`);

                const sheetProjectDto = await SheetUtil.composeProjectDtoFromSheets(sheetService, spreadSheetMetaData);

                logger.info(`Completed to extract element information from schedule [${dbSchedule.name}].`);

                for (const sheetElementDto of sheetProjectDto.elements) {
                    // Current workaround as Google Sheet does not have the project code.
                    sheetElementDto.projectCode = dbProject.code;

                    logger.info(`Comparing element [${sheetElementDto.guid}] in schedule [${dbSchedule.name}] and database.`);

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
                            const sheetValue = sheetResult?.length > 0 && sheetResult[0] != null ? sheetResult[0] : "";
                            const dbResult = JSONPath({ path: field.path, json: dbElement });
                            const dbValue = dbResult?.length > 0 && dbResult[0] != null ? dbResult[0] : "";

                            if (sheetValue != dbValue) {
                                changeSet.push({ path: field.path, newValue: sheetValue });
                            }
                        }
                    }
                    // Detect changes in all the fields editable in all sheets.

                    // Apply changes to the database.
                    if (changeSet.length > 0) {
                        logger.info(`Element [${sheetElementDto.guid}]: ${changeSet.length} field(s) changed.`);

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

                logger.info(`Completed the database synchronization process.`);
            }

            logger.info(`Started the ArchiCAD synchronization process.`);

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

            logger.info(`Completed the ArchiCAD synchronization process.`);
        }
    }
    catch (error) {
        console.error(error);
    }
    finally {
        await dbService.disconnect();
    }
}

main(process.argv.slice(2)).catch(console.error);
import { homedir } from "os";
import dayjs from 'dayjs';
import { existsSync, readFileSync, writeFileSync } from "fs";
import pino from "pino";
import { create } from 'xmlbuilder2';
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { DatabaseModelUtil } from "./databaseModelUtil.js";
import { XmlFileUtil } from "./xmlFileUtil.js";
import { SheetUtil } from "./sheetUtil.js";
import { GoogleSheetService } from "./google_sheet_api.js";
import { initializeConfigurations, getDatabaseConnectionUrl, getDatabaseName } from "./config.js";
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

    if (direction != "googleSheetSync" && dataFileName == null) {
        console.error('Data file name is required.');
        process.exit(1);
    }

    return [direction, projectName, dataFileName];
}

async function performDatabaseSynchronization(dbService, dbProject, projectDtoFromFile) { }

async function main(args) {
    // Retrieve the file name from the command line arguments.
    const [direction, projectName, dataFileName] = handleConsoleArguments(args);

    logger.info(`direction = ${direction}`);
    logger.info(`projectName = ${projectName}`);
    logger.info(`dataFileName = ${dataFileName}`);

    const dataFilePath = `${homedir()}/bohm/files/${dataFileName}`;

    // Initialize the configuration.
    initializeConfigurations(projectName);

    // Initialize the MongoDB connection.
    const dbService = new DatabaseService(getDatabaseConnectionUrl(), getDatabaseName());

    // Connect to the database.
    await dbService.connect().catch(err => {
        console.error(err);
        process.exit(1);
    });

    logger.info(`Initialized the database connection.`);

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
            let dbElements = await dbService.findMany("elements", { guid: { $in: projectDtoFromFile.elements.map(element => { return element.guid; }) }, projectCode: dbProject.code });
            let newElementDtosFromFile = projectDtoFromFile.elements.filter(element => !dbElements.some(dbElement => dbElement.guid === element.guid));
            let dbDeletedElements = await dbService.findMany("elements", { guid: { $in: projectDtoFromFile.deletedElements }, projectCode: dbProject.code });

            logger.info(`Elements to be updated in the database: ${dbElements.length}`);
            logger.info(`New elements to be imported into database: ${newElementDtosFromFile.length}`);
            logger.info(`Elements to be deleted from database: ${dbDeletedElements.length}`);

            logger.info(`Started to update elements in the database.`);

            // Handle element updates and persist into DB.
            for (let dbElement of dbElements) {
                // const dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbElement, "ArchiCAD", "Element updated.");
                // await dbService.insertOne("elementSnapshots", dbElementSnapshot);

                // logger.info(`Snapshot has been taken for the current element [${dbElement.guid}] in the database.`);

                const elementDtoFromFile = projectDtoFromFile.elements.find(element => element.guid === dbElement.guid);

                dbElement.name = elementDtoFromFile.name;
                dbElement.modiStamp = elementDtoFromFile.modiStamp;
                dbElement.classification = elementDtoFromFile.classification;
                dbElement.classificationGroup = elementDtoFromFile.classificationGroup;
                dbElement.coreProperties = elementDtoFromFile.coreProperties;
                dbElement.customProperties = elementDtoFromFile.customProperties;

                await dbService.replaceOne("elements", { guid: elementDtoFromFile.guid, projectCode: dbProject.code }, dbElement);

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
                // for (let dbDeletedElement of dbDeletedElements) {
                //     const dbElementSnapshot = DatabaseModelUtil.composeElementSnapshotFromModel(dbDeletedElement, "ArchiCAD", "Element deleted.");
                //     await dbService.insertOne("elementSnapshots", dbElementSnapshot);

                //     logger.info(`A snapshot has been taken for the deleted element [${dbDeletedElement.guid}].`);
                // }

                await dbService.deleteMany("elements", { guid: { $in: dbDeletedElements.map(dbElement => { return dbElement.guid; }) } });

                logger.info(`Invalid elements have been deleted from the database.`);
            }
            // Handle deleted elements from ArchiCAD.

            //
            // End database synchronization.
            //

            logger.info(`Completed the database synchronization process.`);
        } else if (direction === "pull") {
            logger.info(`Started the ArchiCAD synchronization process.`);

            //
            // Start ArchiCAD synchronization.
            //
            const dbElementsForExport = await dbService.findMany("elements", { projectCode: dbProject.code });
            const xmlProjectDto = DatabaseModelUtil.composeProjectDtoFromModel(dbProject, dbElementsForExport);
            const projectXmlDoc = XmlFileUtil.composeXmlObjectFromDto(xmlProjectDto);

            try {
                writeFileSync(dataFilePath, create({ encoding: "UTF-8", standalone: false }, projectXmlDoc).end({ prettyPrint: true }));

                logger.info(`${dayjs().format('YYYY-MM-DD HH:mm:ss')}: ${dataFilePath} has been saved.`);
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
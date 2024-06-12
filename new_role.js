import { DatabaseService } from "./databaseService.js";
import { initializeConfigurations, getDatabaseConnectionUrl, getDatabaseName } from "./config.js";
import pino from "pino";
const logger = pino({ level: "info" });

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

async function main() {

    // Retrieve the file name from the command line arguments.
    const projectName = "Token Bungalow";

    // Initialize the configuration.
    initializeConfigurations(projectName);

    // Initialize the MongoDB connection.
    const dbService = new DatabaseService(getDatabaseConnectionUrl(), getDatabaseName());

    // Connect to the database.
    await dbService.connect().catch(err => {
        console.error(err);
        process.exit(1);
    });

    logger.info(`Initialized the database connection to ${getDatabaseConnectionUrl()} / ${getDatabaseName()}.`);
    try {
        let count = 0;
        let count1 = 0;

        const dbPrivileges = await dbService.findMany("privileges", { role: 'programmer' });
        for (const dbPrivilege of dbPrivileges) {
            dbPrivilege.role = "subContractorRoofTruss";
            delete dbPrivilege._id;

            await dbService.insertOne("privileges", dbPrivilege);
        }

        for (const dbPrivilege of dbPrivileges) {
            dbPrivilege.role = "subContractorHeatPump";
            delete dbPrivilege._id;

            await dbService.insertOne("privileges", dbPrivilege);
        }
    }
    catch (error) {
        console.error(error);
    }
    finally {
        await dbService.disconnect();
    }
}

main();
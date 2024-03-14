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

async function main(args) {

    // Retrieve the file name from the command line arguments.
    const [direction, projectName, dataFileName] = handleConsoleArguments(args);

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
    try {

        const dbProject = await dbService.findOne("projects", { name: projectName });

        const dbElements = await dbService.findMany("elements", { projectCode: dbProject.code });

        for (let dbElement of dbElements) {
            dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Supply Cost (ex VAT)"] = null;
            await dbService.replaceOne("elements", { guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
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
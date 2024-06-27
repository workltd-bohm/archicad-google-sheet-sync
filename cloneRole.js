import { DatabaseService } from "./databaseService.js";
import { initializeConfigurations, getDatabaseConnectionUrl, getDatabaseName } from "./config.js";
import pino from "pino";
const logger = pino({ level: "info" });
import { MongoClient } from 'mongodb';

async function main() {

    // Retrieve the file name from the command line arguments.
    const projectName = "Token Bungalow";
    const newRole = "subContractorElectrical";

    // Initialize the configuration.
    initializeConfigurations(projectName);

    // Initialize the MongoDB connection.
    const productionDbUrl = "mongodb://bohm-app:FMX4Af79YUNbQQCxK5tC@ec2-3-73-242-63.eu-central-1.compute.amazonaws.com:27017/?authSource=bohm";
    const productionDbName = "bohm";

    const prodClient = new MongoClient(productionDbUrl);
    await prodClient.connect();
    const prodDb = prodClient.db(productionDbName);

    logger.info(`Initialized the database connection to ${getDatabaseConnectionUrl()} / ${getDatabaseName()}.`);
    try {
        const dbPrivileges = await prodDb.collection("privileges").find({ role: "programmer" }).toArray();

        for (const dbPrivilege of dbPrivileges) {
            delete dbPrivilege["_id"];
            dbPrivilege.role = newRole;
            if (dbPrivilege.section == "procurement") {
                const fields = Object.keys(dbPrivilege.fields);

                for (const field of fields) {
                    dbPrivilege.fields[field].read = [];
                    dbPrivilege.fields[field].write = [];
                }
            }
        }

        await prodDb.collection("privileges").insertMany(dbPrivileges);
    }
    catch (error) {
        console.error(error);
    }
    finally {
        await prodClient.close();
    }
}

main();
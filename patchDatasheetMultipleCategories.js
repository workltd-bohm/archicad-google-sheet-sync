import { initializeConfigurations, getDatabaseConnectionUrl, getDatabaseName } from "./config.js";
import pino from "pino";
const logger = pino({ level: "info" });
import { MongoClient } from 'mongodb';

async function main() {

    // Retrieve the file name from the command line arguments.
    const projectName = "Token Bungalow";

    // Initialize the configuration.
    initializeConfigurations(projectName);

    // Initialize the MongoDB connection.
    /***** PRODUCTION *****/
    const dbUrl = "mongodb://bohm-app:FMX4Af79YUNbQQCxK5tC@ec2-3-73-242-63.eu-central-1.compute.amazonaws.com:27017/?authSource=bohm";
    const dbName = "bohm";
    /***** PRODUCTION *****/

    /***** DEV *****/
    // const dbUrl = "mongodb://root:K5V4nkT2ye4VEBPGt6NJ@10.0.1.200:27017/";
    // const dbName = "bohm";
    /***** DEV *****/

    // const prodClient = new MongoClient(productionDbUrl);
    // await prodClient.connect();
    // const prodDb = prodClient.db(productionDbName);

    const dbClient = new MongoClient(dbUrl);
    await dbClient.connect();
    const db = dbClient.db(dbName);

    logger.info(`Initialized the database connection to ${dbUrl} / ${dbName}.`);

    try {
        const dbProject = await db.collection("projects").findOne({ name: projectName });
        const dbElements = await db.collection("elements").find({ projectCode: dbProject.code }).toArray();

        for (const dbElement of dbElements) {
            if (!Array.isArray(dbElement.coreProperties.specification.datasheets) && dbElement.coreProperties.specification.datasheets?.length > 0) {
                // console.log(dbElement.coreProperties.specification.datasheets);
                dbElement.coreProperties.specification.datasheets = [{
                    datasheetType: ["miscellaneous"],
                    originalFileName: "tech-sheet-overflow.pdf",
                    cid: "QmTc2BT2o7PPr6291gpm9NndfdXav3X6mdw6v6zPD2KVzs",
                    link: "https://ipfs.io/ipfs/QmTc2BT2o7PPr6291gpm9NndfdXav3X6mdw6v6zPD2KVzs",
                    user: "allen@workltd.co.uk",
                    dateTime: new Date().toISOString()
                }];

                console.log(dbElement.guid);

                await db.collection("elements").replaceOne({ guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
            }
            
        }
    }
    catch (error) {
        console.error(error);
    }
    finally {
        await dbClient.close();
        // await prodClient.close();
    }
}

main();
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
        const dbClassificationTemplates = await db.collection("classificationTemplates").find().toArray();

        for (const dbElement of dbElements) {
            
            if (dbElement.classification.code == "Ss_20_05_15__06") {
                dbElement.validation.design.specification.dimensions.mainContractor = "not_started";
                dbElement.validation.design.specification.material.mainContractor = "not_started";
                dbElement.validation.design.ss_20_05_15__06.maxTemperature.subContractorHeatPump = "not_started";

                await db.collection("elements").replaceOne({ guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
            }

            
            // dbElement.coreProperties.specification.datasheets = [];
            
        }

        // for (const dbElement of dbElements) {
        //     dbElement.validation = {};
        //     dbElement.validation.design = {};
        //     dbElement.validation.design.specification = {};
            
        //     for (const key of Object.keys(dbElement.coreProperties.specification)) {
        //         dbElement.validation.design.specification[key] = {
        //             architect: "not_started",
        //         }
        //     }

        //     const dbClassificationTemplate = dbClassificationTemplates.find(dbClassificationTemplate => dbClassificationTemplate.code == dbElement.classification.code);

        //     if (dbClassificationTemplate) {
        //         const elementTypeId = dbElement.classification.code[0].toLowerCase() + dbElement.classification.code.slice(1);
        //         dbElement.validation.design[elementTypeId] = {};
        //         for (const key of Object.keys(dbClassificationTemplate.template)) {
        //             dbElement.validation.design[elementTypeId][key] = {
        //                 architect: "not_started",
        //             }
        //         }
        //     }
            
        //     await db.collection("elements").replaceOne({ guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
        // }

        // const dbPrivileges = await db.collection("privileges").find().toArray();

        // for (const dbPrivilege of dbPrivileges) {

        //     for (const key of Object.keys(dbPrivilege.fields)) {
        //         dbPrivilege.fields[key].designValidate = dbPrivilege.role == "architect" ? ["*"] : [];
        //     }

        //     await db.collection("privileges").replaceOne({ role: dbPrivilege.role, section: dbPrivilege.section }, dbPrivilege);
        // }
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
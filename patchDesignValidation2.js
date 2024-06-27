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

    const classificationCode = "Ss_40_45_70__31";
    const changeSet = [
        ["ss_40_45_70__31", "mounting", "subContractorVentilation"],
        ["ss_40_45_70__31", "ductDiameter", "subContractorVentilation"],
        ["ss_40_45_70__31", "electricalConnection", "subContractorElectrical"],
        ["ss_40_45_70__31", "fuseRating", "subContractorElectrical"]
        // ["specification", "manufacturer", "plumbing"],
        // ["specification", "productSeries", "plumbing"],
        // ["specification", "productName", "plumbing"],
        // ["specification", "productCode", "plumbing"],
        // ["specification", "datasheets", "plumbing"],
        // ["specification", "dimensions", "subContractorHeatPump"],
        // ["specification", "material", "mainContractor"],
    ]

    try {
        const dbProject = await db.collection("projects").findOne({ name: projectName });

        for (const [section, field, role] of changeSet) {
            const dbElements = await db.collection("elements").find({ projectCode: dbProject.code, "classification.code": classificationCode }).toArray();

            for (const dbElement of dbElements) {
                dbElement.validation.design[section][field][role] = "not_started";
                console.log(`dbElement.validation.design[${section}][${field}][${role}] = "not_started";`)

                await db.collection("elements").replaceOne({ guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
            }

            if (section == "specification") {
                const dbPrivilege = await db.collection("privileges").findOne({ role: role, section: section });

                if (dbPrivilege) {
                    dbPrivilege.fields[field].designValidate.push(classificationCode);
                    console.log(`dbPrivilege.fields[${field}].designValidate.push(${classificationCode});`);

                    await db.collection("privileges").replaceOne({ role: dbPrivilege.role, section: dbPrivilege.section }, dbPrivilege);
                }

            } else {
                const dbPrivilege = await db.collection("privileges").findOne({ role: role, section: section });

                if (dbPrivilege) {
                    dbPrivilege.fields[field].designValidate = ["*"];
                    console.log(`dbPrivilege.fields[${field}].designValidate = ["*"];`);

                    await db.collection("privileges").replaceOne({ role: dbPrivilege.role, section: dbPrivilege.section }, dbPrivilege);
                }
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
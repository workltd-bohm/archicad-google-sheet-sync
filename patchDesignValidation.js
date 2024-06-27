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
    // const dbUrl = "mongodb://bohm-app:FMX4Af79YUNbQQCxK5tC@ec2-3-73-242-63.eu-central-1.compute.amazonaws.com:27017/?authSource=bohm";
    // const dbName = "bohm";
    /***** PRODUCTION *****/

    /***** DEV *****/
    const dbUrl = "mongodb://root:K5V4nkT2ye4VEBPGt6NJ@10.0.1.200:27017/";
    const dbName = "bohm";
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
            if (dbElement.classification.code == "Ss_25_30_20__02") {
                dbElement.validation = {
                    design: {
                        specification: {
                            manufacturer: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            productSeries: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            productName: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            productCode: {
                                architect: "not_started",
                                mechanical: "not_started",
                                mainContractor: "not_started",
                            },
                            datasheets: {
                                architect: "not_started",
                                mechanical: "not_started",
                                mainContractor: "not_started",
                            },
                            dimensions: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            material: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            finish: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            weight: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            embodiedCarbon: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            objectSpecific: {
                                architect: "not_started",
                            },
                        },
                        ss_25_30_20__02: {
                            surfaceArea: {
                                architect: "not_started",
                            },
                            fireRating: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            flameSpreadRequirement: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            "tensileStrength:": {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            uvResistance: {
                                architect: "not_started",
                                mechanical: "not_started",
                                mainContractor: "not_started",
                            },
                            waterVapourResistanceFactor: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            moistureVapourPermeability: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            airtightness: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            watertightness: {
                                architect: "not_started",
                                mechanical: "not_started",
                            },
                            gasketType: {
                                architect: "not_started",
                                mechanical: "not_started",
                                mainContractor: "not_started",
                            },
                            gasketGrooveDimensions: {
                                architect: "not_started",
                                mechanical: "not_started",
                                mainContractor: "not_started",
                            },
                        }
                    }
                }
                // console.table(JSON.stringify(dbElement.validation, null, 2));
                await db.collection("elements").replaceOne({ guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
            }
        }

        const dbPrivileges = await db.collection("privileges").find().toArray();

        for (const dbPrivilege of dbPrivileges) {

            for (const key of Object.keys(dbPrivilege.fields)) {
                dbPrivilege.fields[key].designValidate = dbPrivilege.role == "architect" ? ["*"] : [];
            }

            // await db.collection("privileges").replaceOne({ role: dbPrivilege.role, section: dbPrivilege.section }, dbPrivilege);
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
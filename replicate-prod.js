import { initializeConfigurations, getDatabaseConnectionUrl, getDatabaseName } from "./config.js";
import { MongoClient } from 'mongodb';

const productionDbUrl = "mongodb://bohm-app:FMX4Af79YUNbQQCxK5tC@ec2-3-73-242-63.eu-central-1.compute.amazonaws.com:27017/?authSource=bohm";
const productionDbName = "bohm";

const devDbUrl = "mongodb://root:K5V4nkT2ye4VEBPGt6NJ@10.0.1.200:27017/";
const devDbName = "bohm";

const prodClient = new MongoClient(productionDbUrl);
await prodClient.connect();
const prodDb = prodClient.db(productionDbName);

const devClient = new MongoClient(devDbUrl);
await devClient.connect();
const devDb = devClient.db(devDbName);

const dbProdCollections = await prodDb.listCollections().toArray();

for (const dbProdCollection of dbProdCollections) {
    if (dbProdCollection.type != "collection") {
        continue;
    }

    const dbProdDocuments = await prodDb.collection(dbProdCollection.name).find().toArray();

    console.log(`Collection "${dbProdCollection.name}" in PROD DB has ${dbProdDocuments.length} documents`);

    await devDb.collection(dbProdCollection.name).drop();

    console.log(`Collection "${dbProdCollection.name}" in DEV DB has been dropped`);

    await devDb.collection(dbProdCollection.name).insertMany(dbProdDocuments);

    console.log(`Collection "${dbProdCollection.name}" has been replicated from PROD DB to DEV DB.`);
}

await devClient.close();
await prodClient.close();

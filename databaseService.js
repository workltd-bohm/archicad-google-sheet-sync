import { MongoClient } from "mongodb";
import pino from "pino";

const logger = pino({ level: "info" });

export const DatabaseService = class {
    constructor(uri, dbName) {
        this.uri = uri;
        this.dbName = dbName;
        this.client = new MongoClient(uri);
    }

    async connect() {
        try {
            await this.client.connect();
            this.db = this.client.db(this.dbName);
        } catch (error) {
            logger.error(`Error connecting to MongoDB: ${error}`);
            throw error;
        }
    }

    async disconnect() {
        try {
            await this.client.close();
        } catch (error) {
            logger.error(`Error disconnecting from MongoDB: ${error}`);
            throw error;
        }
    }

    async insertOne(collectionName, document) {
        try {
            const result = await this.db.collection(collectionName).insertOne(document);
            return result.insertedId;
        } catch (error) {
            logger.error(`Error inserting document into MongoDB: ${error}`);
            throw error;
        }
    }

    async insertMany(collectionName, documents) {
        try {
            const result = await this.db.collection(collectionName).insertMany(documents);
            return result.insertedIds;
        } catch (error) {
            logger.error(`Error inserting documents into MongoDB: ${error}`);
            throw error;
        }
    }

    async findOne(collectionName, filter) {
        try {
            return await this.db.collection(collectionName).findOne(filter);
        } catch (error) {
            logger.error(`Error finding document in MongoDB: ${error}`);
            throw error;
        }
    }

    async findAll(collectionName) {
        try {
            return await this.db.collection(collectionName).find({}).toArray();
        } catch (error) {
            logger.error(`Error finding documents in MongoDB: ${error}`);
            throw error;
        }
    }

    async findMany(collectionName, filter) {
        try {
            return await this.db.collection(collectionName).find(filter).toArray();
        } catch (error) {
            logger.error(`Error finding documents in MongoDB: ${error}`);
            throw error;
        }
    }

    async replaceOne(collectionName, filter, replacement) {
        try {
            const result = await this.db.collection(collectionName).replaceOne(filter, replacement);
            return result.modifiedCount > 0;
        } catch (error) {
            logger.error(`Error replacing document in MongoDB: ${error}`);
            throw error;
        }
    }

    async updateOne(collectionName, filter, update) {
        try {
            const result = await this.db.collection(collectionName).updateOne(filter, { $set: update });
            return result.modifiedCount > 0;
        } catch (error) {
            logger.error(`Error updating document in MongoDB: ${error}`);
            throw error;
        }
    }

    async updateMany(collectionName, filter, update) {
        try {
            const result = await this.db.collection(collectionName).updateMany(filter, { $set: update });
            return result.modifiedCount > 0;
        } catch (error) {
            logger.error(`Error updating documents in MongoDB: ${error}`);
            throw error;
        }
    }

    async deleteOne(collectionName, filter) {
        try {
            const result = await this.db.collection(collectionName).deleteOne(filter);
            return result.deletedCount > 0;
        } catch (error) {
            logger.error(`Error deleting document from MongoDB: ${error}`);
            throw error;
        }
    }

    async deleteMany(collectionName, filter) {
        try {
            const result = await this.db.collection(collectionName).deleteMany(filter);
            return result.deletedCount > 0;
        } catch (error) {
            logger.error(`Error deleting documents from MongoDB: ${error}`);
            throw error;
        }
    }
};
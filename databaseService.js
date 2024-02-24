import { MongoClient } from 'mongodb';

export const DatabaseService = class {
    constructor(uri, dbName) {
        this.uri = uri;
        this.dbName = dbName;
        this.client = new MongoClient(uri);
    }

    async connect() {
        try {
            await this.client.connect();
            console.log('Connected to MongoDB');
            this.db = this.client.db(this.dbName);
        } catch (error) {
            console.error('Error connecting to MongoDB:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            await this.client.close();
            console.log('Disconnected from MongoDB');
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error);
            throw error;
        }
    }

    async insertOne(collectionName, document) {
        try {
            const result = await this.db.collection(collectionName).insertOne(document);
            return result.insertedId;
        } catch (error) {
            console.error('Error inserting document into MongoDB:', error);
            throw error;
        }
    }

    async insertMany(collectionName, documents) {
        try {
            const result = await this.db.collection(collectionName).insertMany(documents);
            return result.insertedIds;
        } catch (error) {
            console.error('Error inserting documents into MongoDB:', error);
            throw error;
        }
    }

    async findOne(collectionName, filter) {
        try {
            return await this.db.collection(collectionName).findOne(filter);
        } catch (error) {
            console.error('Error finding document in MongoDB:', error);
            throw error;
        }
    }

    async findAll(collectionName) {
        try {
            return await this.db.collection(collectionName).find({}).toArray();
        } catch (error) {
            console.error('Error finding documents in MongoDB:', error);
            throw error;
        }
    }

    async findMany(collectionName, filter) {
        try {
            return await this.db.collection(collectionName).find(filter).toArray();
        } catch (error) {
            console.error('Error finding documents in MongoDB:', error);
            throw error;
        }
    }

    async updateOne(collectionName, filter, update) {
        try {
            const result = await this.db.collection(collectionName).updateOne(filter, { $set: update });
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating document in MongoDB:', error);
            throw error;
        }
    }

    async updateMany(collectionName, filter, update) {
        try {
            const result = await this.db.collection(collectionName).updateMany(filter, { $set: update });
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating documents in MongoDB:', error);
            throw error;
        }
    }

    async deleteOne(collectionName, filter) {
        try {
            const result = await this.db.collection(collectionName).deleteOne(filter);
            return result.deletedCount > 0;
        } catch (error) {
            console.error('Error deleting document from MongoDB:', error);
            throw error;
        }
    }

    async deleteMany(collectionName, filter) {
        try {
            const result = await this.db.collection(collectionName).deleteMany(filter);
            return result.deletedCount > 0;
        } catch (error) {
            console.error('Error deleting documents from MongoDB:', error);
            throw error;
        }
    }
};
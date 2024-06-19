import { DatabaseService } from "./databaseService.js";
import { initializeConfigurations, getDatabaseConnectionUrl, getDatabaseName } from "./config.js";
import pino from "pino";
const logger = pino({ level: "info" });

const fileNameMapping = {
    "QmUkMe8RNrcdemfw3Bd5keQCwDE8UJiF5k8QpczFTdriPz": "Screenshot 2024-06-18 at 16.35.38.png",
    "Qmdet5LT64WZ3CaGinUbHspU4esnsb3xvRkiJTAByzswzU": "file-48854.pdf",
    "QmYUyzp9qjcBBFG9jHCXg7C5rUzwxx9tVdLdz2JmP3EkLC": "file-503019 2.pdf",
    "QmTc2BT2o7PPr6291gpm9NndfdXav3X6mdw6v6zPD2KVzs": "tech-sheet-overflow.pdf",
    "QmfM2zta5fHL1G6fkbbZexrA9AJ4Sz5tg6HWwVLsnVULwJ": "UNIVOLT_FXKVR_Datasheet.pdf",
    "QmQDF5tRMinQbCzzv4MoQxvUbeRVaLyYYdnQ8ZFBxjmPpR": "ProductConformityCertification-Creeksea.pdf",
    "QmRFbzPgZpTQiyAhYXdzMvmym1rXswkAmhT1t52mtnBLP5": "F0054043_0001.pdf",
    "QmWpyz59TNFC7qoGajAFiPq2vG7NMgedk5CxTxit5uF8Ko": "FloPlast Half round.pdf",
    "QmSE5YJ1xR8aMoW4VuBG9s29rVYtgtdLgz1KnEoeKftWFV": "TF01_225090_GLOBAL_en.pdf",
    "QmZWCC4NQM5yL8GZr2A8L3SAcGcsBDya1ppzWvLPscCxJC": "floplast-rainwater-brochure-2021.pdf",
    "QmUde6Xt1EPYvmLkGy61HKBrXSk2kKhcRdXcn6BwF677RA": "Technical-Datasheet-Brick-slips-12-2020-1.pdf",
    "QmahPjWT1ixtFxDURgZfrqz8XuyV3BtXDHCEdA2UiQFvEy": "KOP-en-technical-data-sheet.pdf",
    "QmXiRCfnTCwWPT7hHYjXoeWC6i8u3zcZrhhSic7QgsE8uG": "2022_05_WHT PLATE C_EN.pdf",
    "QmVgmaEAxJfP6AcbvztnGZ1bGSvnjHnDtrik9CpuYR5tX4": "WBR-en-technical-data-sheet.pdf",
    "QmRELrUZUHnKx9uY9TWRu3rmycajbzFhc8aWsPf67dmRnK": "SLOT-en-technical-data-sheet.pdf",
    "QmW84spkxs7PcowshM71KY8tGsWWKLNei5aQjSWcEZBX5W": "THERMOWASHER-en-technical-data-sheet.pdf",
    "QmVxPKb2cJkH5a3S64JSYNDWAjDek2eqHHfMcGjrK1Q5KS": "HBS-en-technical-data-sheet.pdf",
    "QmPL6zKhodzHRY5WnKAYmZ3bidMxLQBpsyHFLtGzZfsHNE": "LBS-en-technical-data-sheet.pdf",
    "QmWvEwnuvkPLnR8xSjpDKwVKxsvXAaubU4QeTL45hvvU1v": "British-Gypsum-PDS-Gyproc-Moisture-Resistant-12-5mm.pdf",
    "QmXyiRZ67Pn3x4cweinqU1KVarWxnkXtdhmo3aB4Gjjzpo": "British-Gypsum-PDS-Gyproc-WallBoard-12-5mm.pdf"
};

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
        // const dbPageConfigurations = await dbService.findMany("pageConfigurations", { projectCode: "TKB" });
        // const dbPrivileges = await dbService.findMany("privileges", { project: projectName, role: "architect" });

        // const dbPrivSpec = await dbService.findOne("privileges", { role: "architect", section: "specification" });

        // const fields = Object.keys(dbPrivSpec.fields);

        // for (const field of fields) {
        //     dbPrivSpec.fields[field].write = ["*"];
        // }

        // await dbService.replaceOne("privileges", { role: "architect", section: "specification" }, dbPrivSpec);

        // const dbPrivProc = await dbService.findOne("privileges", { role: "architect", section: "procurement" });

        // const fields = Object.keys(dbPrivProc.fields);

        // for (const field of fields) {
        //     dbPrivProc.fields[field].read = ["*"];
        //     dbPrivProc.fields[field].write = ["*"];
        // }

        // await dbService.replaceOne("privileges", { role: "architect", section: "procurement" }, dbPrivProc);

        // const dbValParty = await dbService.findOne("privileges", { role: "architect", section: "validationParties" });

        // const fields = Object.keys(dbValParty.fields);

        // for (const field of fields) {
        //     dbValParty.fields[field].write = ["*"];
        // }

        // await dbService.replaceOne("privileges", { role: "architect", section: "validationParties" }, dbValParty);

        // const dbValStatus = await dbService.findOne("privileges", { role: "architect", section: "validationStatus" });

        // const fields = Object.keys(dbValStatus.fields);

        // for (const field of fields) {
        //     dbValStatus.fields[field].write = ["*"];
        // }

        // await dbService.replaceOne("privileges", { role: "architect", section: "validationStatus" }, dbValStatus);

        // for (const dbPageConfiguration of dbPageConfigurations) {
        //     const dbPrivilege = await dbService.findOne("privileges", { role: "architect", section: dbPageConfiguration.id });

        //     const fields = Object.keys(dbPrivilege.fields);

        //     for (const field of fields) {
        //         if (dbPrivilege.fields[field].write.length == 0 || dbPrivilege.fields[field].write[0] != "*") {
        //             // console.log(`${dbPageConfiguration.id} > ${field} > ${JSON.stringify(dbPrivilege.fields[field].write, null, 2)}`);
        //             dbPrivilege.fields[field].write.push("*");
        //         }
        //     }

        //     await dbService.replaceOne("privileges", { role: "architect", section: dbPageConfiguration.id }, dbPrivilege);

        // }

        const dbProject = await dbService.findOne("projects", { name: projectName });
        const dbElements = await dbService.findMany("elements", { projectCode: dbProject.code });
        // const dbClassifications = await dbService.findMany("classifications", {});

        for (const dbElement of dbElements) {
            if (dbElement.coreProperties.specification.datasheets == null ||
                dbElement.coreProperties.specification.datasheets == "" ||
                dbElement.coreProperties.specification.datasheets == "TBC" ||
                dbElement.coreProperties.specification.datasheets == "N/A" ||
                !dbElement.coreProperties.specification.datasheets.startsWith("https://ipfs.io/")) {
                dbElement.coreProperties.specification.datasheets = [];
            } else {
                dbElement.coreProperties.specification.datasheets = [{
                    datasheetType: "others",
                    originalFileName: fileNameMapping[dbElement.coreProperties.specification.datasheets.replace("https://ipfs.io/ipfs/", "")],
                    cid: dbElement.coreProperties.specification.datasheets.replace("https://ipfs.io/ipfs/", ""),
                    link: dbElement.coreProperties.specification.datasheets,
                    user: "allen@workltd.co.uk",
                    dateTime: new Date().toISOString()
                }];
            }

            await dbService.replaceOne("elements", { guid: dbElement.guid, projectCode: dbProject.code }, dbElement);
        }

        //     if (dbElement.classification.code == "") {
        //         dbElement.classification.code = "Ss__01";
        //         dbElement.classification.name = "Systems";
        //         dbElement.classification.full = "Ss__01 Systems";
        //     } else {
        //         dbElement.classification.code = dbElement.classification.code + "__01";
        //     }

        //     const dbClassification = dbClassifications.find(dbClassification => dbClassification.code == dbElement.classification.code);

        //     if (dbClassification != null) {
        //         dbElement.classification.name = dbClassification.name;
        //         dbElement.classification.full = dbClassification.full;
        //     }

        //     delete dbElement["classificationGroup"];

        //     let newCoreProperties = {};

        //     newCoreProperties.specification = {};
        //     newCoreProperties.specification.manufacturer = dbElement.coreProperties["00.00 SPECIFICATION"]["Manufacturer"];
        //     newCoreProperties.specification.productSeries = dbElement.coreProperties["00.00 SPECIFICATION"]["Product Series"];
        //     newCoreProperties.specification.productName = dbElement.coreProperties["00.00 SPECIFICATION"]["Product Name"];
        //     newCoreProperties.specification.productCode = dbElement.coreProperties["00.00 SPECIFICATION"]["Product Code"];
        //     newCoreProperties.specification.datasheets = dbElement.coreProperties["00.00 SPECIFICATION"]["Datasheet(s)"];
        //     newCoreProperties.specification.objectSpecific = dbElement.coreProperties["00.00 SPECIFICATION"]["Object Specific"];
        //     newCoreProperties.specification.dimensions = null;
        //     newCoreProperties.specification.material = null;
        //     newCoreProperties.specification.finish = null;
        //     newCoreProperties.specification.weight = null;
        //     newCoreProperties.specification.embodiedCarbon = null;

        //     newCoreProperties.procurement = {};
        //     newCoreProperties.procurement.elementSupplyCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Element Supply Cost (ex VAT)"];
        //     newCoreProperties.procurement.elementOverheads = dbElement.coreProperties["00.30 PROCUREMENT"]["Element Overheads (ex VAT)"];
        //     newCoreProperties.procurement.elementLeadTime = dbElement.coreProperties["00.30 PROCUREMENT"]["Element Lead Time"];
        //     newCoreProperties.procurement.systemSurveyCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Survey Cost (ex VAT)"];
        //     newCoreProperties.procurement.systemDesignCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Design Cost (ex VAT)"];
        //     newCoreProperties.procurement.systemSpecificationCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Specification Cost (ex VAT)"];
        //     newCoreProperties.procurement.systemInstallationCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Installation Cost (ex VAT)"];
        //     newCoreProperties.procurement.systemCommissioningCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Commissioning Cost (ex VAT)"];
        //     newCoreProperties.procurement.systemSupplyCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Supply Cost (ex VAT)"];

        //     newCoreProperties.validationParties = {};
        //     newCoreProperties.validationParties.designSpecificationParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Design Specification Party"];
        //     newCoreProperties.validationParties.bimModelParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["BIM Model Party"];
        //     newCoreProperties.validationParties.procurementParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Procurement Party"];
        //     newCoreProperties.validationParties.supplierParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Supplier Party"];
        //     newCoreProperties.validationParties.deliveryConfirmationParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Delivery Confirmation Party"];
        //     newCoreProperties.validationParties.regulatoryPartyBuildingControl = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Regulatory Party (Building Control)"];
        //     newCoreProperties.validationParties.regulatoryPartyBreeam = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Regulatory Party (BREEAM)"];
        //     newCoreProperties.validationParties.technicalApprovalPartyDesign = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Technical Approval Party (Design)"];
        //     newCoreProperties.validationParties.technicalApprovalPartyInstallation = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Technical Approval Party (Installation)"];
        //     newCoreProperties.validationParties.commissioningParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Commissioning Party"];

        //     newCoreProperties.validationStatus = {};
        //     newCoreProperties.validationStatus.designSpecificationStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Design Specification Status"];
        //     newCoreProperties.validationStatus.bimModelStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["BIM Model Status"];
        //     newCoreProperties.validationStatus.designComments = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Design Comments"];
        //     newCoreProperties.validationStatus.technicalApprovalDesign = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Technical Approval (Design)"];
        //     newCoreProperties.validationStatus.regulatoryApprovalDesign = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Regulatory Approval (Design)"];
        //     newCoreProperties.validationStatus.procurementStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Procurement Status"];
        //     newCoreProperties.validationStatus.procurementComments = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Procurement Comments"];
        //     newCoreProperties.validationStatus.installationStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Installation Status"];
        //     newCoreProperties.validationStatus.installationComments = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Installation Comments"];
        //     newCoreProperties.validationStatus.technicalApprovalInstallation = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Technical Approval (Installation)"];
        //     newCoreProperties.validationStatus.asBuiltLocation = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["As-built Location (XYZ Coordinates + Relevant Level [eg. IL or CL])"];
        //     newCoreProperties.validationStatus.regulatoryApprovalInstallation = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Regulatory Approval (Installation)"];

        //     dbElement.coreProperties = newCoreProperties;
        //     dbElement.customProperties = {};

        //     console.log(`${dbElement.guid}`);


    }
    catch (error) {
        console.error(error);
    }
    finally {
        await dbService.disconnect();
    }
}

main();
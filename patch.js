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

        const dbProject = await dbService.findOne("projects", { name: projectName });
        const dbElements = await dbService.findMany("elements", { projectCode: dbProject.code });
        const dbClassifications = await dbService.findMany("classifications", {});

        for (const dbElement of dbElements) {

            if (dbElement.classification.code == "") {
                dbElement.classification.code = "Ss__01";
                dbElement.classification.name = "Systems";
                dbElement.classification.full = "Ss__01 Systems";
            } else {
                dbElement.classification.code = dbElement.classification.code + "__01";
            }

            const dbClassification = dbClassifications.find(dbClassification => dbClassification.code == dbElement.classification.code);

            if (dbClassification != null) {
                dbElement.classification.name = dbClassification.name;
                dbElement.classification.full = dbClassification.full;
            }

            delete dbElement["classificationGroup"];

            let newCoreProperties = {};

            newCoreProperties.specification = {};
            newCoreProperties.specification.manufacturer = dbElement.coreProperties["00.00 SPECIFICATION"]["Manufacturer"];
            newCoreProperties.specification.productSeries = dbElement.coreProperties["00.00 SPECIFICATION"]["Product Series"];
            newCoreProperties.specification.productName = dbElement.coreProperties["00.00 SPECIFICATION"]["Product Name"];
            newCoreProperties.specification.productCode = dbElement.coreProperties["00.00 SPECIFICATION"]["Product Code"];
            newCoreProperties.specification.datasheets = dbElement.coreProperties["00.00 SPECIFICATION"]["Datasheet(s)"];
            newCoreProperties.specification.objectSpecific = dbElement.coreProperties["00.00 SPECIFICATION"]["Object Specific"];
            newCoreProperties.specification.dimensions = null;
            newCoreProperties.specification.material = null;
            newCoreProperties.specification.finish = null;
            newCoreProperties.specification.weight = null;
            newCoreProperties.specification.embodiedCarbon = null;

            newCoreProperties.procurement = {};
            newCoreProperties.procurement.elementSupplyCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Element Supply Cost (ex VAT)"];
            newCoreProperties.procurement.elementOverheads = dbElement.coreProperties["00.30 PROCUREMENT"]["Element Overheads (ex VAT)"];
            newCoreProperties.procurement.elementLeadTime = dbElement.coreProperties["00.30 PROCUREMENT"]["Element Lead Time"];
            newCoreProperties.procurement.systemSurveyCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Survey Cost (ex VAT)"];
            newCoreProperties.procurement.systemDesignCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Design Cost (ex VAT)"];
            newCoreProperties.procurement.systemSpecificationCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Specification Cost (ex VAT)"];
            newCoreProperties.procurement.systemInstallationCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Installation Cost (ex VAT)"];
            newCoreProperties.procurement.systemCommissioningCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Commissioning Cost (ex VAT)"];
            newCoreProperties.procurement.systemSupplyCost = dbElement.coreProperties["00.30 PROCUREMENT"]["Building System Supply Cost (ex VAT)"];

            newCoreProperties.validationParties = {};
            newCoreProperties.validationParties.designSpecificationParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Design Specification Party"];
            newCoreProperties.validationParties.bimModelParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["BIM Model Party"];
            newCoreProperties.validationParties.procurementParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Procurement Party"];
            newCoreProperties.validationParties.supplierParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Supplier Party"];
            newCoreProperties.validationParties.deliveryConfirmationParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Delivery Confirmation Party"];
            newCoreProperties.validationParties.regulatoryPartyBuildingControl = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Regulatory Party (Building Control)"];
            newCoreProperties.validationParties.regulatoryPartyBreeam = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Regulatory Party (BREEAM)"];
            newCoreProperties.validationParties.technicalApprovalPartyDesign = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Technical Approval Party (Design)"];
            newCoreProperties.validationParties.technicalApprovalPartyInstallation = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Technical Approval Party (Installation)"];
            newCoreProperties.validationParties.commissioningParty = dbElement.coreProperties["00.20 VALIDATION - PARTY (ELEMENT)"]["Commissioning Party"];

            newCoreProperties.validationStatus = {};
            newCoreProperties.validationStatus.designSpecificationStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Design Specification Status"];
            newCoreProperties.validationStatus.bimModelStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["BIM Model Status"];
            newCoreProperties.validationStatus.designComments = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Design Comments"];
            newCoreProperties.validationStatus.technicalApprovalDesign = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Technical Approval (Design)"];
            newCoreProperties.validationStatus.regulatoryApprovalDesign = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Regulatory Approval (Design)"];
            newCoreProperties.validationStatus.procurementStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Procurement Status"];
            newCoreProperties.validationStatus.procurementComments = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Procurement Comments"];
            newCoreProperties.validationStatus.installationStatus = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Installation Status"];
            newCoreProperties.validationStatus.installationComments = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Installation Comments"];
            newCoreProperties.validationStatus.technicalApprovalInstallation = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Technical Approval (Installation)"];
            newCoreProperties.validationStatus.asBuiltLocation = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["As-built Location (XYZ Coordinates + Relevant Level [eg. IL or CL])"];
            newCoreProperties.validationStatus.regulatoryApprovalInstallation = dbElement.coreProperties["00.21 VALIDATION - FEEDBACK LOOP"]["Regulatory Approval (Installation)"];

            dbElement.coreProperties = newCoreProperties;
            dbElement.customProperties = {};

            console.log(`${dbElement.guid}`);

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

main();
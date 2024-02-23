import { select, select1 } from "xpath";
import { configurationCorePropertyMap, configurationCustomPropertyMap } from "./config.js";

export const DatabaseModel = class {
    composeProject = function (projectDto, scheduleDtos) {
        let dbProject = {
            name: projectDto.name,
            code: projectDto.code,
            companyCode: "WRK",
            zones: [],
            roles: [],
            milestones: [],
            schedules: []
        };

        if (scheduleDtos?.length > 0) {
            scheduleDtos.forEach(scheduleDto => {
                dbProject.schedules.push({
                    name: scheduleDto.name,
                    code: scheduleDto.code,
                    start: scheduleDto.start,
                    end: scheduleDto.end
                });
            });
        }

        return dbProject;
    };

    composeElement = function (elementDto) {
        let dbElement = {
            guid: elementDto.guid,
            projectCode: elementDto.projectCode,
            name: elementDto.name,
            type: elementDto.type,
            variation: elementDto.variation,
            zone: elementDto.zone,
            level: elementDto.level,
            geometry: {
                x: elementDto.geometry.x,
                y: elementDto.geometry.y,
                elevation: elementDto.geometry.elevation,
                rotatingAngle: elementDto.geometry.rotatingAngle
            },
            dimension: {
                width: elementDto.dimension.width,
                height: elementDto.dimension.height,
                depth: elementDto.dimension.depth
            },
            location: elementDto.location,
            material: elementDto.material,
            finish: elementDto.finish,
            mount: elementDto.mount,
            modiStamp: elementDto.modiStamp,
            classification: {
                code: elementDto.classification.code,
                name: elementDto.classification.name,
                full: elementDto.classification.full
            },
            classificationGroup: {
                code: elementDto.classificationGroup.code,
                name: elementDto.classificationGroup.name,
                full: elementDto.classificationGroup.full
            },
            libraryPart: {
                index: elementDto.libraryPart.index,
                documentName: elementDto.libraryPart.documentName,
                uniqueId: elementDto.libraryPart.uniqueId
            },
            token: {
                fungible: false,
                contractAddress: null,
                id: null
            },
            coreProperties: {},
            customProperties: {}
        };

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            dbElement.coreProperties[corePtyGpName] = {};
            corePtyMap.forEach(corePtyName => {
                dbElement.coreProperties[corePtyGpName][corePtyName] = elementDto.coreProperties[corePtyGpName][corePtyName];
            });
        });

        if (dbElement.classificationGroup.code != null && dbElement.classificationGroup.name != null) {
            const customPropertyGroupName = `${dbElement.classificationGroup.code} ${dbElement.classificationGroup.name}`;
            dbElement.customProperties[customPropertyGroupName] = {};

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    dbElement.customProperties[customPropertyGroupName][customPtyName] = elementDto.customProperties[customPropertyGroupName][customPtyName];
                });
            }
        }

        return dbElement;
    };
};

export const composeSyncXmlData = function (syncData) {
    let xmlObj = {
        project: {
            "@name": syncData.name,
            elements: {
                element: []
            },
            "deleted-elements": {
                element: []
            }
        }
    };

    for (const element of syncData.elements) {
        let xmlElement = {
            "@guid": element.guid,
            "@name": element.name,
            "@modiStamp": element.modiStamp,
            "library-part": {
                "@documentName": element.libraryPart.documentName,
                "@index": element.libraryPart.index,
                "@uniqueId": element.libraryPart.uniqueId
            },
            classification: { "@code": element.classification.code, "@name": element.classification.name },
            "classification-group": { "@code": element.classificationGroup.code, "@name": element.classificationGroup.name },
            "core-property-groups": { group: [] },
            "custom-property-groups": { group: [] }
        };

        for (const corePtyGroupName of Object.keys(element.coreProperties)) {
            let propertyGroup = { "@name": corePtyGroupName, property: [] };
            for (const corePtyName of Object.keys(element.coreProperties[corePtyGroupName])) {
                propertyGroup.property.push({ "@name": corePtyName, "@value": element.coreProperties[corePtyGroupName][corePtyName] });
            }

            xmlElement["core-property-groups"].group.push(propertyGroup);
        }

        for (const customPtyGroupName of Object.keys(element.customProperties)) {
            let propertyGroup = { "@name": customPtyGroupName, property: [] };
            for (const customPtyName of Object.keys(element.customProperties[customPtyGroupName])) {
                propertyGroup.property.push({ "@name": customPtyName, "@value": element.customProperties[customPtyGroupName][customPtyName] });
            }

            xmlElement["custom-property-groups"].group.push(propertyGroup);
        }

        xmlObj.project.elements.element.push(xmlElement);
    }

    return xmlObj;
}

